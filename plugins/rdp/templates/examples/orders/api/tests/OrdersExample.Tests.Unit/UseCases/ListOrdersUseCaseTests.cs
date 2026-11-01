// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Moq;
using OrdersExample.Application.Repositories;
using OrdersExample.Application.UseCases;
using OrdersExample.Application.UseCases.ListOrders;
using OrdersExample.Entities;

namespace OrdersExample.Tests.Unit.UseCases;

public class ListOrdersUseCaseTests
{
    private static readonly DateTime CreatedAt = new(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IOrderRepository> _orderRepositoryMock = new();
    private readonly ListOrdersUseCase _useCase;

    public ListOrdersUseCaseTests() => _useCase = new ListOrdersUseCase(_orderRepositoryMock.Object);

    [Fact]
    public async Task ExecuteAsync_ReturnsTheRepositoryOrdersInItsOrder()
    {
        // Arrange
        var newer = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "WEGE3", OrderSide.Buy, 1, 40m, CreatedAt.AddMinutes(1));
        var older = Order.Open(Guid.NewGuid(), Guid.NewGuid(), "ABEV3", OrderSide.Sell, 2, 12m, CreatedAt);
        _orderRepositoryMock.Setup(r => r.ListAsync()).ReturnsAsync([newer, older]);

        // Act
        var output = await _useCase.ExecuteAsync();

        // Assert
        Assert.Equal(OutputStatus.Success, output.Status);
        Assert.Equal([newer.Id, older.Id], output.Orders.Select(o => o.Id));
    }

    [Fact]
    public async Task ExecuteAsync_WithNoOrders_ReturnsEmptyList()
    {
        // Arrange
        _orderRepositoryMock.Setup(r => r.ListAsync()).ReturnsAsync([]);

        // Act
        var output = await _useCase.ExecuteAsync();

        // Assert
        Assert.Equal(OutputStatus.Success, output.Status);
        Assert.Empty(output.Orders);
    }
}
