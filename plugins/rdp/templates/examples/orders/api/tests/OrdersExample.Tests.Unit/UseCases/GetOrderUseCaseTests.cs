// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Moq;
using OrdersExample.Application.Repositories;
using OrdersExample.Application.UseCases;
using OrdersExample.Application.UseCases.GetOrder;
using OrdersExample.Entities;

namespace OrdersExample.Tests.Unit.UseCases;

public class GetOrderUseCaseTests
{
    private static readonly DateTime CreatedAt = new(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IOrderRepository> _orderRepositoryMock = new();
    private readonly GetOrderUseCase _useCase;

    public GetOrderUseCaseTests() => _useCase = new GetOrderUseCase(_orderRepositoryMock.Object);

    [Fact]
    public async Task ExecuteAsync_WhenOrderExists_ReturnsIt()
    {
        // Arrange
        var order = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "BBAS3", OrderSide.Buy, 1, 20m, CreatedAt);
        _orderRepositoryMock.Setup(r => r.FindAsync(order.Id)).ReturnsAsync(order);

        // Act
        var output = await _useCase.ExecuteAsync(new GetOrderInput(order.Id));

        // Assert
        Assert.Equal(OutputStatus.Success, output.Status);
        Assert.Equal(order.Id, output.Order?.Id);
        Assert.Equal("BBAS3", output.Order?.Symbol);
    }

    [Fact]
    public async Task ExecuteAsync_WhenOrderIsMissing_ReturnsNotFound()
    {
        // Arrange
        var id = Guid.NewGuid();
        _orderRepositoryMock.Setup(r => r.FindAsync(id)).ReturnsAsync((Order?)null);

        // Act
        var output = await _useCase.ExecuteAsync(new GetOrderInput(id));

        // Assert
        Assert.Equal(OutputStatus.NotFound, output.Status);
        Assert.Equal("order-not-found", output.ErrorCode);
        Assert.Null(output.Order);
    }
}
