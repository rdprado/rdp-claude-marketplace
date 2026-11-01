// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
namespace OrdersExample.Entities;

// Entities are a plain class, never a record: they have identity, and their state changes only through their methods.
public class Order
{
    // For EF Core: it materializes rows through this constructor and the private setters.
    private Order()
    {
    }

    public Guid Id { get; private set; }

    // Chosen by the client for each order it sends; a resend carries the same one, so the order is placed once.
    public Guid ClientOrderId { get; private set; }

    public string Symbol { get; private set; } = string.Empty;
    public OrderSide Side { get; private set; }
    public int Quantity { get; private set; }
    public decimal Price { get; private set; }
    public DateTime CreatedAt { get; private set; }

    /// <summary>
    /// A new order. Callers validate first; invalid values here are a bug, so they throw.
    /// Example: <c>Order.Open(ids.NewId(), clientOrderId, "PETR4", OrderSide.Buy, 100, 37.5m, now)</c>.
    /// </summary>
    public static Order Open(
        Guid id, Guid clientOrderId, string symbol, OrderSide side, int quantity, decimal price, DateTime now)
    {
        if (!OrderRules.IsValidSymbol(symbol))
            throw new ArgumentException("Invalid symbol.", nameof(symbol));
        if (!OrderRules.IsValidQuantity(quantity))
            throw new ArgumentOutOfRangeException(nameof(quantity), "Quantity must be positive.");
        if (!OrderRules.IsValidPrice(price))
            throw new ArgumentOutOfRangeException(nameof(price), "Price must be positive.");

        return new Order
        {
            Id = id,
            ClientOrderId = clientOrderId,
            Symbol = OrderRules.NormalizeSymbol(symbol),
            Side = side,
            Quantity = quantity,
            Price = price,
            CreatedAt = now,
        };
    }

    /// <summary>Whether a send with this order's client order id asks for this same order (a resend).</summary>
    public bool IsSameRequest(string symbol, OrderSide side, int quantity, decimal price)
        => Symbol == OrderRules.NormalizeSymbol(symbol) && Side == side && Quantity == quantity && Price == price;
}
