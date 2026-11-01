// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OrdersExample.Application.Repositories;
using OrdersExample.Entities;

namespace OrdersExample.Infrastructure.OrdersRepository;

public sealed class EFOrderRepository(OrdersDbContext db) : IOrderRepository
{
    public async Task<IReadOnlyList<Order>> ListAsync()
        => await db.Orders.AsNoTracking().OrderByDescending(o => o.CreatedAt).ToListAsync();

    public Task<Order?> FindAsync(Guid id) => db.Orders.SingleOrDefaultAsync(o => o.Id == id);

    public Task<Order?> FindByClientOrderIdAsync(Guid clientOrderId)
        => db.Orders.SingleOrDefaultAsync(o => o.ClientOrderId == clientOrderId);

    public async Task<bool> AddAsync(Order order)
    {
        await db.Orders.AddAsync(order);
        try
        {
            await db.SaveChangesAsync();
            return true;
        }
        catch (DbUpdateException e) when (IsUniqueViolation(e))
        {
            // Recover: the unique index on ClientOrderId stopped a second order with the same one.
            db.Entry(order).State = EntityState.Detached;
            return false;
        }
    }

    // SQLite's code for a broken unique index; swap it with the provider (e.g. SQL Server 2627/2601).
    private static bool IsUniqueViolation(DbUpdateException e)
        => e.InnerException is SqliteException { SqliteExtendedErrorCode: 2067 };

    public async Task UpdateAsync(Order order)
    {
        db.Orders.Update(order);
        await db.SaveChangesAsync();
    }
}
