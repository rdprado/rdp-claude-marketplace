// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.Extensions.Time.Testing;
using Moq;
using OrdersExample.Application.Repositories;
using OrdersExample.Application.UseCases;
using OrdersExample.Application.UseCases.CancelOrder;
using OrdersExample.Entities;

namespace OrdersExample.Tests.Unit.UseCases;

public class CancelOrderUseCaseTests
{
    private static readonly DateTime CreatedAt = new(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);
    private static readonly DateTimeOffset Now = new(2026, 1, 15, 13, 0, 0, TimeSpan.Zero);

    private readonly Mock<IOrderRepository> _orderRepositoryMock = new();
    private readonly CancelOrderUseCase _useCase;

    public CancelOrderUseCaseTests()
        => _useCase = new CancelOrderUseCase(_orderRepositoryMock.Object, new FakeTimeProvider(Now));

    [Fact]
    public async Task ExecuteAsync_OpenOrder_CancelsAndSaves()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "ITUB4", OrderSide.Buy, 5, 30m, CreatedAt);
        _orderRepositoryMock.Setup(r => r.FindAsync(order.Id)).ReturnsAsync(order);

        // Act
        var output = await _useCase.ExecuteAsync(new CancelOrderInput(order.Id));

        // Assert
        Assert.Equal(OutputStatus.Success, output.Status);
        Assert.Equal(OrderStatus.Cancelled, output.Order?.Status);
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
        var output = await _useCase.ExecuteAsync(new CancelOrderInput(id));

        // Assert
        Assert.Equal(OutputStatus.NotFound, output.Status);
        Assert.Equal("order-not-found", output.ErrorCode);
    }

    [Fact]
    public async Task ExecuteAsync_CancelledOrder_ReturnsConflictAndSavesNothing()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "ITUB4", OrderSide.Buy, 5, 30m, CreatedAt);
        order.Cancel(CreatedAt);
        _orderRepositoryMock.Setup(r => r.FindAsync(order.Id)).ReturnsAsync(order);

        // Act
        var output = await _useCase.ExecuteAsync(new CancelOrderInput(order.Id));

        // Assert
        Assert.Equal(OutputStatus.Conflict, output.Status);
        Assert.Equal("order-not-open", output.ErrorCode);
        _orderRepositoryMock.Verify(r => r.UpdateAsync(It.IsAny<Order>()), Times.Never);
    }
}
