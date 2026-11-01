// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Text.RegularExpressions;

namespace OrdersExample.Entities;

// Each order rule, written once: the validators check input with these, and Order guards its invariants with them.
public static partial class OrderRules
{
    public const int SymbolMaxLength = 12;

    // Symbols are stored upper case; input like " petr4 " becomes "PETR4".
    public static string NormalizeSymbol(string symbol) => symbol.Trim().ToUpperInvariant();

    public static bool IsValidSymbol(string symbol) => SymbolPattern().IsMatch(NormalizeSymbol(symbol));

    public static bool IsValidQuantity(int quantity) => quantity > 0;

    public static bool IsValidPrice(decimal price) => price > 0;

    [GeneratedRegex("^[A-Z0-9]{1,12}$")]
    private static partial Regex SymbolPattern();
}
