---
name: passive-view
description: "RDP Passive View for WinForms: dumb form, view interface, adaptor, controller, parent delegate, IViewCreator for child windows, UI-thread marshaling, controller tests. Use only for a new WinForms screen, or when the developer has decided to refactor a WinForms screen to Passive View. Not for fixes in an existing legacy form."
---
# Passive View — WinForms

How we build WinForms screens (Fowler's Passive View). The Core — entities, use cases, ports,
`OutputStatus`, `ValidationResult` — follows `rdp-mode` and the orders example; this skill is the
entry layer. Most WinForms projects are legacy. Use this skill for a new screen, or when the
developer has decided on a refactor; then the screen moves to this shape, one screen at a time.
For a fix in an existing legacy form, keep the form's current style and don't propose the refactor.

## The four types per screen

1. **Form** (`TwapOrderForm`) — widgets and layout only. No state, no `if`, no domain types. Exposes
   its widgets as `internal` accessors for the adaptor.
2. **View interface** (`ITwapOrderView : IView`) — the screen as the controller sees it: properties,
   events, `Show`. Framework-neutral types only (`string`, `bool`, `Color`, `EventHandler`).
3. **Adaptor** (`TwapOrderViewAdaptor`) — the only class that knows the widgets. Owns its form
   (`new` in a field, disposed on close), maps each interface member to a widget, marshals to the UI
   thread. No logic.
4. **Controller** (`TwapOrderViewController`) — every decision: parsing, colours, enabled state,
   messages. Calls use cases and pushes the result back through the interface.

The form and the use cases never know each other; only the controller knows both. The form is
never registered in DI.

```csharp
// Components/TwapOrderView/ITwapOrderView.cs
public interface ITwapOrderView : IView
{
    string PriceText { get; set; }
    Color PriceBackColor { get; set; }
    bool ExecuteEnabled { get; set; }
    void ShowMessage(string text);

    event EventHandler? PriceChanged;
    event EventHandler? ExecuteClicked;
    event EventHandler? Closed;
}
```

```csharp
// Components/TwapOrderView/TwapOrderViewAdaptor.cs — maps, nothing else
public sealed class TwapOrderViewAdaptor : ITwapOrderView, IWinFormsView
{
    private readonly TwapOrderForm form = new();

    string ITwapOrderView.PriceText
    {
        get => form.PriceField.Text;
        set => form.PriceField.Text = value;
    }

    event EventHandler? ITwapOrderView.ExecuteClicked
    {
        add => form.ExecuteButton.Click += value;
        remove => form.ExecuteButton.Click -= value;
    }
    // ...one member per interface item
}
```

The default is the adaptor. Let the form implement `IXxxView` itself only with a reason; the
adaptor is required when the form isn't yours (vendor or generated code).

## Front to back: a command

Click → adaptor event → controller → use case → port → Infra → backend, and the `Output` comes
back the same way.

```csharp
// Components/TwapOrderView/TwapOrderViewController.cs
public sealed class TwapOrderViewController : ITwapOrderViewController
{
    private readonly ITwapOrderView view;
    private readonly ICreateTwapUseCase createTwap;

    public TwapOrderViewController(ITwapOrderView view, ICreateTwapUseCase createTwap)
    {
        this.view = view;
        this.createTwap = createTwap;
        view.PriceChanged   += OnPriceChanged;
        view.ExecuteClicked += OnExecuteClicked;
    }

    private void OnPriceChanged(object? sender, EventArgs e)
    {
        var ok = decimal.TryParse(view.PriceText, NumberStyles.Float, CultureInfo.InvariantCulture, out _);
        view.PriceBackColor = ok ? NormalBackColor : InvalidBackColor;
        view.ExecuteEnabled = ok;
    }

    // async void: a WinForms event handler. ConfigureAwait(true) returns to the UI thread.
    private async void OnExecuteClicked(object? sender, EventArgs e)
    {
        var input = new CreateTwapInput(decimal.Parse(view.PriceText, CultureInfo.InvariantCulture));
        var output = await createTwap.ExecuteAsync(input).ConfigureAwait(true);
        view.ShowMessage(output.Status switch
        {
            OutputStatus.Success    => "Order sent.",
            OutputStatus.Validation => ErrorTexts.For(output.ErrorCode), // code → text, in the App layer
            _                       => "Something went wrong.",
        });
    }
}
```

UI rules (colours, enabled state) live in the controller; business rules live in the use case, even
when both use the same number (two separate constants).

## Back to front: a push

Data pushed by Infra (market ticks, socket messages) comes through a port the use case subscribes
to. The controller holds the subscription and disposes it on change and on close. The adaptor
marshals to the UI thread, because the push arrives on another thread.

```csharp
// BookViewController — subscribe, format, push to the view
private void OnSelectedSymbolChanged(object? sender, EventArgs e)
{
    subscription?.Dispose();
    subscription = subscribeMarketData.Execute(new SubscribeMarketDataInput(view.SelectedSymbol, OnPriceTick)).Subscription;
}

private void OnPriceTick(object? sender, PriceTick tick)
    => view.LastPrice = tick.Price.ToString("0.00", CultureInfo.InvariantCulture);
```

```csharp
// BookViewAdaptor — the only place that knows about the UI thread
string IBookView.LastPrice
{
    set
    {
        if (form.InvokeRequired) form.BeginInvoke(() => form.PriceLabel.Text = value);
        else form.PriceLabel.Text = value;
    }
}
```

## Child to parent: the delegate

When a child screen needs something that belongs to its parent (title bar, status pane), its
controller calls `I<Name>ViewDelegate`. The parent controller implements it and decides what to do.
Methods are past-tense notifications (`TwapOrderViewWasSetAsActive(ticker)`). The child never
names the parent's type. No delegate if the child never talks back up.

## Opening screens: `IViewCreator`

Controllers open controllers; views never open views.

```csharp
// MainViewController, on "Open TWAP" click
var child = viewCreator.Create<ITwapOrderViewController, TwapOrderViewController>(this); // this = delegate
child.Closed += OnTwapOrderClosed;
child.Show(view); // own view as the parent window
```

- `ViewCreator` wraps `ActivatorUtilities.CreateInstance`. It is the **only** class that touches the
  container service-locator style.
- A child controller's parent-facing interface is `Show(IView parent)` + `event Closed`, nothing more.
- `IView` (public) is the base of every view interface. `IWinFormsView` (`internal`) exposes the
  `IWin32Window`; only adaptors cast to it, inside `Show`.

## Projects and DI

```
<App>.Core       Entities + Application — references nothing
<App>.Infra      implements the ports — references Core
<App>.App        Components/<Screen>/ (IXxxView, IXxxViewController, IXxxViewDelegate,
                 form, adaptor, controller), IView, IWinFormsView, IViewCreator, Program.cs
<App>.UnitTests  controllers and use cases
```

`Program.cs` is the composition root: singletons for ports, use cases, `IViewCreator`, the shell
adaptor and shell controller; each child view interface → its adaptor as **transient** (one per
window). Child controllers are not registered — `IViewCreator` builds them. Then
`Application.Run(mainAdaptor.Form)`.

Naming: `View` for the role (`ITwapOrderView`, `TwapOrderViewController`), the framework word for the
concrete class (`MainWindow`, `TwapOrderForm`).

## Tests

xUnit + Moq, per `rdp-mode` → "Tests". The controller is the target: mock the view interface, raise
its events, check what the controller set.

```csharp
[Fact]
public void PriceChanged_WithInvalidText_MarksFieldAndDisablesExecute()
{
    // Arrange
    var view = new Mock<ITwapOrderView>();
    view.SetupAllProperties();
    _ = new TwapOrderViewController(view.Object, Mock.Of<ICreateTwapUseCase>());
    view.Object.PriceText = "abc";

    // Act
    view.Raise(v => v.PriceChanged += null, EventArgs.Empty);

    // Assert
    Assert.Equal(InvalidBackColor, view.Object.PriceBackColor);
    Assert.False(view.Object.ExecuteEnabled);
}
```

- Parent controllers: `Mock<IViewCreator>` returns `Mock<IChildController>`; check the `Create`
  arguments, `Show(view)` and the cleanup on `Closed`.
- Delegates: `Mock<IXxxViewDelegate>`, verify the notification and its argument.
- No unit tests for forms, adaptors or `ViewCreator`: no logic.

## Refactoring a legacy form

1. Write `IXxxView` from what the form shows and the events it raises.
2. Move the logic from the form's handlers into a controller against that interface. Business rules
   go to use cases.
3. Write the controller tests.
4. Strip the form to widgets + `internal` accessors; add the adaptor; wire it in `Program.cs`.

## Don't

- Don't put an `if`, parsing or formatting in a form.
- Don't use widget types in a controller or on a view interface.
- Don't let a view open another view. A controller does it through `IViewCreator`.
- Don't take `IServiceProvider` anywhere except `ViewCreator`.
- Don't register forms in DI. The adaptor owns its form.
- Don't marshal threads in a controller. The adaptor does it.
- Don't put business rules in a controller.
