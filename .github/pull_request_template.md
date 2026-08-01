## Outcome

<!-- What user or operator outcome changes? -->

## Trust boundaries

<!-- Identity, authorization, data, browser, package, build, or deployment boundaries affected. -->

## Dependency review

<!-- None, or link the package/source/tarball/lock/license/install-script review. -->

## Starter adoption

<!-- Which shell and reference compositions were selected, adapted, or removed, and why is each remaining abstraction appropriate here? -->

## Verification

- [ ] `make ci`
- [ ] `make security`
- [ ] Keyboard, focus, loading, empty, denied, and error states reviewed
- [ ] No result count presented as a total; truncated streams surfaced as incomplete
- [ ] No credential reachable from the browser, the bundle, or `config.json`
- [ ] Unused starter UI, routes, styles, fixtures, and dependencies removed
- [ ] Threat model and operator documentation updated where behaviour changed
