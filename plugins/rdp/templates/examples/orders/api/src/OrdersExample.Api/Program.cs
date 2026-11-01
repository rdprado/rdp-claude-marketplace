// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
using OrdersExample.Api;
using OrdersExample.Api.Errors;
using OrdersExample.Api.Logging;
using OrdersExample.Application;
using OrdersExample.DevIdentityProvider;
using OrdersExample.Infrastructure.Ids;
using OrdersExample.Infrastructure.OrdersRepository;
using Serilog;
using Serilog.Events;
using Serilog.Filters;

var builder = WebApplication.CreateBuilder(args);

// Serilog: the app log and the audit log (category "Audit"), one file per day each, in every environment.
// The console only in Development. Read inside the callback so test hosts can override the paths.
// Serilog deletes files beyond RetainedDays when it rolls (it counts files: one per day).
// With preserveStaticLogger, each host keeps its own logger instead of the global Log.Logger (several test hosts run at once).
const string logTemplate =
    "[{Timestamp:HH:mm:ss} {Level:u3}] [{RequestId}] [{SourceContext}] {Message:lj}{NewLine}{Exception}";
builder.Services.AddSerilog((services, logger) =>
{
    var configuration = services.GetRequiredService<IConfiguration>();
    var logs = configuration.GetSection(LogsOptions.SectionName).Get<LogsOptions>()
        ?? throw new InvalidOperationException("Logs is missing in appsettings.");
    // ReadFrom.Services: sinks registered in DI are added too (the integration tests register one to read the events).
    logger.ReadFrom.Configuration(configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .WriteTo.Logger(app => app
            .Filter.ByExcluding(Matching.FromSource(ActionLogMiddleware.AuditCategory))
            .WriteTo.File(logs.FilePath, rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: logs.RetainedDays, outputTemplate: logTemplate))
        .WriteTo.Logger(audit => audit
            .Filter.ByIncludingOnly(Matching.FromSource(ActionLogMiddleware.AuditCategory))
            .WriteTo.File(logs.AuditFilePath, rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: logs.RetainedDays, outputTemplate: logTemplate));
    if (builder.Environment.IsDevelopment())
        logger.WriteTo.Console(outputTemplate: logTemplate);
}, preserveStaticLogger: true);

builder.Services
    .AddSingleton(TimeProvider.System)
    .AddIds()
    .AddApplication()
    .AddOrdersRepository()
    .AddApi(builder.Configuration, builder.Environment);
if (builder.Environment.IsDevelopment())
    builder.Services.AddDevIdentityProvider(builder.Configuration);

var app = builder.Build();

app.Services.CreateOrdersSchema();

app.UseExceptionHandler();
// Any error status with no body (unknown route 404, wrong method 405, wrong Content-Type 415) gets the one error shape.
app.UseStatusCodePages(context => context.HttpContext.Response.WriteAsJsonAsync(
    ApiErrors.Body(ApiErrors.FromStatusCode(context.HttpContext.Response.StatusCode))));
// If the app serves static files, put this after UseStaticFiles, so pages with a token in the URL aren't logged.
app.UseSerilogRequestLogging(options =>
{
    // This host's logger, not the global Log.Logger (preserveStaticLogger above).
    options.Logger = app.Services.GetRequiredService<Serilog.ILogger>();
    options.GetLevel = (http, elapsed, ex) =>
    {
        if (ex != null || http.Response.StatusCode > 499)
            return LogEventLevel.Error;
        return elapsed > 5000 ? LogEventLevel.Warning : LogEventLevel.Information;
    };
});
app.UseAuthentication();
app.UseAuthorization();
// Audit after authentication, so it knows who made each write.
app.UseMiddleware<ActionLogMiddleware>();
app.MapControllers();

await app.RunAsync();
