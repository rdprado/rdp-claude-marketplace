// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.Extensions.Time.Testing;
using Moq;
using OrdersExample.Application.Repositories;
using OrdersExample.Application.UseCases;
using OrdersExample.Application.UseCases.CreateOrder;
using OrdersExample.Entities;
using OrdersExample.Infrastructure.Ids;

namespace OrdersExample.Tests.Unit.UseCases;

public class CreateOrderUseCaseTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 15, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid NewId = Guid.Parse("8f14e45f-ceea-467f-a8d0-000000000001");
    private const string ClientOrderId = "5f0c1b2a-3d4e-4f60-8a7b-9c0d1e2f3a4b";

    private readonly Mock<IOrderRepository> _orderRepositoryMock = new();
    private readonly Mock<IIdGenerator> _idGeneratorMock = new();
    private readonly CreateOrderUseCase _useCase;

    public CreateOrderUseCaseTests()
    {
        _idGeneratorMock.Setup(g => g.NewId()).Returns(NewId);
        _orderRepositoryMock.Setup(r => r.AddAsync(It.IsAny<Order>())).ReturnsAsync(true);
        _useCase = new CreateOrderUseCase(_orderRepositoryMock.Object, _idGeneratorMock.Object, new FakeTimeProvider(Now));
    }

    [Fact]
    public async Task ExecuteAsync_WithValidInput_SavesAndReturnsOpenOrder()
    {
        // Arrange
        var input = new CreateOrderInput(ClientOrderId, "petr4", "sell", 100, 37.5m);

        // Act
        var output = await _useCase.ExecuteAsync(input);

        // Assert
        Assert.Equal(OutputStatus.Success, output.Status);
        Assert.NotNull(output.Order);
        Assert.False(output.IsReplay);
        Assert.Equal(NewId, output.Order.Id);
        Assert.Equal(Guid.Parse(ClientOrderId), output.Order.ClientOrderId);
        Assert.Equal("PETR4", output.Order.Symbol);
        Assert.Equal(OrderSide.Sell, output.Order.Side);
        Assert.Equal(OrderStatus.Open, output.Order.Status);
        Assert.Equal(Now.UtcDateTime, output.Order.CreatedAt);
        _orderRepositoryMock.Verify(r => r.AddAsync(It.Is<Order>(o => o.Id == NewId)), Times.Once);
    }

    [Fact]
    public async Task ExecuteAsync_WithInvalidInput_ReturnsValidationWithFieldsAndSavesNothing()
    {
        // Arrange
        var input = new CreateOrderInput(ClientOrderId, "PETR4", "hold", 100, 37.5m);

        // Act
        var output = await _useCase.ExecuteAsync(input);

        // Assert
        Assert.Equal(OutputStatus.Validation, output.Status);
        Assert.Equal("validation-failed", output.ErrorCode);
        Assert.Equal(new Dictionary<string, string> { ["side"] = "invalid" }, output.Fields);
        _orderRepositoryMock.Verify(r => r.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    [Fact]
    public async Task ExecuteAsync_WithClientOrderIdOfTheSameOrder_ReturnsThatOrderAndSavesNothing()
    {
        // Arrange: a retry after the answer to the first send was lost
        var taken = Order.Open(Guid.NewGuid(), Guid.Parse(ClientOrderId), "PETR4", OrderSide.Sell, 100, 37.5m, Now.UtcDateTime);
        _orderRepositoryMock.Setup(r => r.FindByClientOrderIdAsync(Guid.Parse(ClientOrderId))).ReturnsAsync(taken);

        // Act
        var output = await _useCase.ExecuteAsync(new CreateOrderInput(ClientOrderId, "petr4", "sell", 100, 37.5m));

        // Assert
        Assert.Equal(OutputStatus.Success, output.Status);
        Assert.True(output.IsReplay);
        Assert.Equal(taken.Id, output.Order?.Id);
        _orderRepositoryMock.Verify(r => r.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    [Fact]
    public async Task ExecuteAsync_WithClientOrderIdOfAnotherOrder_ReturnsConflictAndSavesNothing()
    {
        // Arrange
        var taken = Order.Open(Guid.NewGuid(), Guid.Parse(ClientOrderId), "PETR4", OrderSide.Sell, 100, 37.5m, Now.UtcDateTime);
        _orderRepositoryMock.Setup(r => r.FindByClientOrderIdAsync(Guid.Parse(ClientOrderId))).ReturnsAsync(taken);

        // Act
        var output = await _useCase.ExecuteAsync(new CreateOrderInput(ClientOrderId, "PETR4", "sell", 200, 37.5m));

        // Assert
        Assert.Equal(OutputStatus.Conflict, output.Status);
        Assert.Equal("client-order-id-reused", output.ErrorCode);
        Assert.Null(output.Order);
        _orderRepositoryMock.Verify(r => r.AddAsync(It.IsAny<Order>()), Times.Never);
    }

    [Fact]
    public async Task ExecuteAsync_WhenAConcurrentSendTookTheClientOrderId_ReturnsTheOrderItSaved()
    {
        // Arrange: not there when checked, there when saving (the other send won the race)
        var taken = Order.Open(Guid.NewGuid(), Guid.Parse(ClientOrderId), "PETR4", OrderSide.Sell, 100, 37.5m, Now.UtcDateTime);
        _orderRepositoryMock.SetupSequence(r => r.FindByClientOrderIdAsync(Guid.Parse(ClientOrderId)))
            .ReturnsAsync((Order?)null)
            .ReturnsAsync(taken);
        _orderRepositoryMock.Setup(r => r.AddAsync(It.IsAny<Order>())).ReturnsAsync(false);

        // Act
        var output = await _useCase.ExecuteAsync(new CreateOrderInput(ClientOrderId, "PETR4", "sell", 100, 37.5m));

        // Assert
        Assert.Equal(OutputStatus.Success, output.Status);
        Assert.True(output.IsReplay);
        Assert.Equal(taken.Id, output.Order?.Id);
    }
}
