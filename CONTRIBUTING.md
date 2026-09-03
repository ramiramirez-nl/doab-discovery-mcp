# Contributing

## Before opening a pull request

```bash
npm run check
```

That runs the test suite, the TypeScript build, ESLint and a Prettier format check.

## Adding or changing a DOAB query field

DOAB's DSpace index fails silently: a query naming a field it does not index is not an error, it
matches zero records. A unit test with a stubbed `fetch` cannot catch that.

So any change that puts a new field into a query must:

1. add the field to `DOAB_FIELDS` in `src/doab/fields.ts`, with a comment on anything surprising
   about its values (`dc.language` holds names, not ISO codes; `dc.subject.other` mixes free
   keywords with Thema strings);
2. add it to the field probe in `tests/live-doab.test.ts`;
3. pass `DOAB_LIVE_TEST=1 npm test`.

If a field turns out to be present in metadata but not searchable, as `publisher.country` is,
it belongs in `UNFILTERABLE_FIELDS`, and the tool that would have used it must warn the caller
that the value affects ranking only, rather than quietly returning nothing.

## Scope

This is a discovery server. It does not assess book quality, verify peer review, judge licence
compliance, or vet publishers, and tool descriptions should not imply otherwise.
