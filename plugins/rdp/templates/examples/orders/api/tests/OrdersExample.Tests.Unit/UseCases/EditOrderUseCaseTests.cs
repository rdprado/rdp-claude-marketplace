// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.Extensions.Time.Testing;
using Moq;
using OrdersExample.Application.Repositories;
using OrdersExample.Application.UseCases;
using OrdersExample.Application.UseCases.EditOrder;
using OrdersExample.Entities;

namespace OrdersExample.Tests.Unit.UseCases;

public class EditOrderUseCaseTests
{
    private static readonly DateTime CreatedAt = new(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);
    private static readonly DateTimeOffset Now = new(2026, 1, 15, 12, 30, 0, TimeSpan.Zero);

    private readonly Mock<IOrderRepository> _orderRepositoryMock = new();
    private readonly EditOrderUseCase _useCase;

    public EditOrderUseCaseTests()
        => _useCase = new EditOrderUseCase(_orderRepositoryMock.Object, new FakeTimeProvider(Now));

    [Fact]
    public async Task ExecuteAsync_OpenOrder_UpdatesQuantityPriceAndUpdatedAt()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "PETR4", OrderSide.Buy, 100, 37.5m, CreatedAt);
        _orderRepositoryMock.Setup(r => r.FindAsync(order.Id)).ReturnsAsync(order);

        // Act
        var output = await _useCase.ExecuteAsync(new EditOrderInput(order.Id, 200, 38m));

        // Assert
        Assert.Equal(OutputStatus.Success, output.Status);
        Assert.Equal(200, output.Order?.Quantity);
        Assert.Equal(38m, output.Order?.Price);
        Assert.Equal(Now.UtcDateTime, output.Order?.UpdatedAt);
        _orderRepositoryMock.Verify(r => r.UpdateAsync(order), Times.Once);
    }

    [Fact]
    public async Task ExecuteAsync_WhenOrderIsMissing_ReturnsNotFound()
    {
        // Arrange
        var id = Guid.NewGuid();
        _orderRepositoryMock.Setup(r => r.FindAsync(id)).ReturnsAsync((Order?)null);

        // Act
        var output = await _useCase.ExecuteAsync(new EditOrderInput(id, 1, 1m));

        // Assert
        Assert.Equal(OutputStatus.NotFound, output.Status);
        Assert.Equal("order-not-found", output.ErrorCode);
    }

    [Fact]
    public async Task ExecuteAsync_CancelledOrder_ReturnsConflictAndSavesNothing()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "PETR4", OrderSide.Buy, 100, 37.5m, CreatedAt);
        order.Cancel(CreatedAt);
        _orderRepositoryMock.Setup(r => r.FindAsync(order.Id)).ReturnsAsync(order);

        // Act
        var output = await _useCase.ExecuteAsync(new EditOrderInput(order.Id, 200, 38m));

        // Assert
        Assert.Equal(OutputStatus.Conflict, output.Status);
        Assert.Equal("order-not-open", output.ErrorCode);
        Assert.Equal(100, order.Quantity);
        _orderRepositoryMock.Verify(r => r.UpdateAsync(It.IsAny<Order>()), Times.Never);
    }

    [Fact]
    public async Task ExecuteAsync_WithInvalidInput_ReturnsValidationWithoutLoadingTheOrder()
    {
        // Arrange
        var input = new EditOrderInput(Guid.NewGuid(), 0, 38m);

        // Act
        var output = await _useCase.ExecuteAsync(input);

        // Assert
        Assert.Equal(OutputStatus.Validation, output.Status);
        Assert.Equal(new Dictionary<string, string> { ["quantity"] = "must-be-positive" }, output.Fields);
        _orderRepositoryMock.Verify(r => r.FindAsync(It.IsAny<Guid>()), Times.Never);
    }
}
