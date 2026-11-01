// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
namespace OrdersExample.Entities;

// Entities are a plain class, never a record: they have identity and mutable state.
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
    public OrderStatus Status { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    // The front shows the edit and cancel buttons from these; it never decides them itself.
    public bool CanEdit => Status == OrderStatus.Open;
    public bool CanCancel => Status == OrderStatus.Open;

    /// <summary>
    /// A new open order. Callers validate first; invalid values here are a bug, so they throw.
    /// Example: <c>Order.Open(ids.NewId(), clientOrderId, "PETR4", OrderSide.Buy, 100, 37.5m, now)</c>.
    /// </summary>
    public static Order Open(
        Guid id, Guid clientOrderId, string symbol, OrderSide side, int quantity, decimal price, DateTime now)
    {
        if (!OrderRules.IsValidSymbol(symbol))
            throw new ArgumentException("Invalid symbol.", nameof(symbol));
        EnsureValidQuantityAndPrice(quantity, price);

        return new Order
        {
            Id = id,
            ClientOrderId = clientOrderId,
            Symbol = OrderRules.NormalizeSymbol(symbol),
            Side = side,
            Quantity = quantity,
            Price = price,
            Status = OrderStatus.Open,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    /// <summary>Whether a send with this order's client order id asks for this same order (a resend).</summary>
    public bool IsSameRequest(string symbol, OrderSide side, int quantity, decimal price)
        => Symbol == OrderRules.NormalizeSymbol(symbol) && Side == side && Quantity == quantity && Price == price;

    public void Edit(int quantity, decimal price, DateTime now)
    {
        if (!CanEdit)
            throw new InvalidOperationException("Only an open order can be edited.");
        EnsureValidQuantityAndPrice(quantity, price);

        Quantity = quantity;
        Price = price;
        UpdatedAt = now;
    }

    public void Cancel(DateTime now)
    {
        if (!CanCancel)
            throw new InvalidOperationException("Only an open order can be cancelled.");

        Status = OrderStatus.Cancelled;
        UpdatedAt = now;
    }

    private static void EnsureValidQuantityAndPrice(int quantity, decimal price)
    {
        if (!OrderRules.IsValidQuantity(quantity))
            throw new ArgumentOutOfRangeException(nameof(quantity), "Quantity must be positive.");
        if (!OrderRules.IsValidPrice(price))
            throw new ArgumentOutOfRangeException(nameof(price), "Price must be positive.");
    }
}
