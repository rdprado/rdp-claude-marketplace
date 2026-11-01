// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using System.Diagnostics.CodeAnalysis;

namespace OrdersExample.Application.UseCases;

public sealed record ValidationResult
{
    public static readonly ValidationResult Success = new(true, null, null);

    // Fields: field name -> field error code, so one 400 can name every field that is wrong.
    public static ValidationResult Fail(string errorCode, IReadOnlyDictionary<string, string>? fields = null)
        => new(false, errorCode, fields);

    private ValidationResult(bool isValid, string? errorCode, IReadOnlyDictionary<string, string>? fields)
    {
        IsValid = isValid;
        ErrorCode = errorCode;
        Fields = fields;
    }

    // Tells the compiler ErrorCode is non-null whenever IsValid is false,
    // so callers don't need `!` after checking IsValid.
    [MemberNotNullWhen(false, nameof(ErrorCode))]
    public bool IsValid { get; }

    public string? ErrorCode { get; }

    public IReadOnlyDictionary<string, string>? Fields { get; }
}
