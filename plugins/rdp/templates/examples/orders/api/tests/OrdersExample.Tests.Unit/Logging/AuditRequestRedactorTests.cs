// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Api.Logging;

namespace OrdersExample.Tests.Unit.Logging;

public class AuditRequestRedactorTests
{
    [Fact]
    public void Redact_OrderRequest_KeepsEveryField()
    {
        // Arrange
        const string json = """{"symbol":"PETR4","side":"buy","quantity":100,"price":37.5}""";

        // Act
        var redacted = AuditRequestRedactor.Redact(json);

        // Assert
        Assert.Equal(json, redacted);
    }

    [Theory]
    [InlineData("password")]
    [InlineData("refresh_token")]
    [InlineData("accessToken")]
    [InlineData("Email")]
    [InlineData("cpf")]
    [InlineData("client-secret")]
    public void Redact_SensitiveField_IsHidden(string name)
    {
        // Arrange
        var json = $$"""{"{{name}}":"value-to-hide","symbol":"PETR4"}""";

        // Act
        var redacted = AuditRequestRedactor.Redact(json);

        // Assert
        Assert.Equal($$"""{"{{name}}":"***","symbol":"PETR4"}""", redacted);
    }

    [Fact]
    public void Redact_SensitiveFieldInsideArrayOfObjects_IsHidden()
    {
        // Arrange
        const string json = """{"contacts":[{"email":"a@b.c","name":"x"}]}""";

        // Act
        var redacted = AuditRequestRedactor.Redact(json);

        // Assert
        Assert.Equal("""{"contacts":[{"email":"***","name":"x"}]}""", redacted);
    }

    [Fact]
    public void Redact_TextThatIsNotJson_IsNotLogged()
    {
        // Act
        var redacted = AuditRequestRedactor.Redact("password=hunter2");

        // Assert
        Assert.Equal("(not JSON)", redacted);
    }

    [Fact]
    public void Redact_NoBody_StaysNull()
    {
        // Act
        var redacted = AuditRequestRedactor.Redact(null);

        // Assert
        Assert.Null(redacted);
    }
}
