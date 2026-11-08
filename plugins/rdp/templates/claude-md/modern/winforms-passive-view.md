Stack: .NET <version> + WinForms (Passive View)

## Template: WinForms with Passive View

- Every screen follows the `passive-view` skill: form, view interface, adaptor, controller.
  Load it with the Skill tool before writing or changing a screen.
- The Core follows the `rdp-mode` skill. Tests: controllers (`Mock<IXxxView>`) and use
  cases, per `passive-view`.

## Layout

```
<App>.Core        Entities + Application (ports, use cases) — references nothing
<App>.Infra       implements the ports — references Core
<App>.App         Components/<Screen>/ (view interface, form, adaptor, controller),
                  IView, IWinFormsView, IViewCreator, Program.cs
<App>.UnitTests   controllers and use cases
```

Build:
```
dotnet build
dotnet test
```
