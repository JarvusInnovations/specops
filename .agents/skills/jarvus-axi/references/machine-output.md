# Machine-readable output: the `*-out` side channel

## The rule

Stdout is always the agent-optimized TOON view. There is no `--json` mode on stdout, and no
`--format` selector.

When a script, a `jq` pipeline or a spreadsheet needs the data, the caller passes an explicit
per-format flag and the tool writes the full payload to a file:

```
$ metabase-axi query "SELECT …" --db 3 --csv-out
…the usual capped TOON preview…
wrote: /tmp/metabase-axi/2026-06-24T15-02-11-query.csv (412 rows, 7 cols)
columns: id:Integer, total:Float, created_at:DateTime, …
help[1]:
  Run `head -5 /tmp/metabase-axi/2026-06-24T15-02-11-query.csv` to inspect the export
```

## Why not `--json` on stdout

We tried it. Several tools shipped `--json` and each later removed it. The reasons:

- **It forks the contract.** With two stdout modes, every hint, empty state, truncation note
  and error has to be designed twice, and the JSON one is the one nobody reviews.
- **It bloats agent context.** An agent that reaches for `--json | jq` pulls the whole payload
  through its context window, which is the cost TOON previews exist to avoid.
- **Stdout discipline is hard.** A JSON consumer breaks on any stray line, and neither the SDK
  nor our tools are strict about what else reaches stdout.
- **A file is better for the actual job.** The agent can run several `jq` queries against one
  export without re-running the command.

Upstream considered the question in
[kunchenguid/axi#32](https://github.com/kunchenguid/axi/issues/32) and left it to tool
authors, so this is a house convention, not an AXI rule. `--json` is the first flag an agent
with habits from other CLIs will try, so it belongs in the parser's hint table pointing at
`--json-out` (see `flags.md`).

## Flag shape

- **One flag per format, named for the format:** `--json-out`, `--csv-out`, `--xlsx-out`,
  `--tsv-out`, `--ndjson-out`, `--text-out`. No generic `--out`, and no inferring the format
  from a file extension. The agent picks the format by intent, and the flag says which.
- **The path is optional and takes `=`:** `--json-out` or `--json-out=./q4.json`. The space
  form is an error whose message names the `=` form. This keeps the next positional (often an
  id) from being swallowed as a path.
- **At most one `*-out` flag per call.** Two is a `VALIDATION_ERROR`.
- **Not on every command.** Offer export where a script use exists or the payload can exceed
  the display cap. On other commands the flag is recognized and refused with a pointer to a
  command that supports it, so the agent learns where it works.

## Where the file goes

- **Bare flag:** the OS temp directory, under a directory for the tool:
  `<tmpdir>/<tool>/<UTC timestamp>-<command>.<ext>`. Never under `~/.config`. An auto-named
  export is scratch, and the config directory is durable state that nothing prunes. (One tool
  shipped the config location first and its exports grew without bound.)
- **`=path`:** written where the caller says, and it stays there.

Auto-named files are private by construction:

- The directory is created `0700` and the file `0600`. Set the mode explicitly after writing,
  because the mode passed to a write call is subject to the umask.
- On a shared machine use a per-user directory (`<tool>-<uid>`), check an existing directory
  with `lstat` before trusting it, open with exclusive-create, and add `-2`, `-3` on a name
  clash.
- Never follow a symlink at the target path.

## Order of operations

1. Parse flags and validate the export path **before any work**: before the API call, before
   reading logs, before a mutation is sent. A path that cannot be written must fail the command
   while nothing has happened yet.
2. Do the work.
3. Write the file. If the write fails after the work succeeded, keep the stdout preview, add an
   `export_error:` line, remove any partial file and exit 1.
4. Print the normal view, then the `wrote:` block.

## What the file holds

- **Complete and uncapped.** The export ignores `--limit`, `--head` and truncation. That is its
  purpose.
- **The source's own shape.** Write the library result or API body as it is. Field names change
  only when the library or protocol version does.
- **Errors too, where the tool is scripted end to end.** If a consumer drives the CLI
  unattended, write a failed command's error object to the file as well, so the script reads
  the outcome from the file and the exit code and never parses TOON.
- **Streams are NDJSON.** A following or streaming command writes one object per line.

## What stdout adds

Stdout rows are byte-identical with and without the flag. Test that. Three things are added:

```
wrote: <path> (<n> rows, <m> cols)
columns: <name>[:<type>], …
help[1]:
  Run `jq '.rows[] | select(.total > 100)' <path>` to process the full result
```

- `wrote:` confirms the path and size. Say `overwrote:` when an explicit path replaced a file.
- `columns:` lets the agent write its first `jq` or `csvkit` call without opening the file.
- The hint is a real command against that exact path, using the tool that fits the format.
  Tests should execute the printed example.

**Column names in TOON equal the keys in the file.** If the table shows `due` and the JSON
says `due_date`, the agent's first `jq` expression is wrong. Don't rename for display. The one
exception is flattening a nested reference into a single cell.

## Formats beyond JSON

Add a format when the consumer is something other than `jq`. The same rules apply to all of
them.

| Flag | Use it for | Notes |
| --- | --- | --- |
| `--json-out` | `jq`, scripts | The default choice. One document. |
| `--ndjson-out` | Streams, large record sets, line tools | One object per line. Round-trips into a bulk import. |
| `--csv-out` | Spreadsheets, `csvkit`, handing data to a person | Flat. Declare it lossy when records nest. |
| `--tsv-out` | Text with commas and quotes, such as transcripts | Same caveats as CSV. |
| `--xlsx-out` | A person who will open it in a spreadsheet app | Only when the upstream can produce it. |
| `--text-out` | Long prose: a transcript, a document body | Plain text; no `columns:` line. |

Guidance for choosing and building them:

- **Map onto the upstream's native export where one exists.** If the service already serves
  CSV, JSON or XLSX for a query, pass that through. The file is then the source's real output,
  with its own type handling, and not our re-serialization of it. metabase-axi does this for
  all three of its formats.
- **Say when a format loses information.** CSV cannot hold nested records. gitsheets-axi
  writes JSON and NDJSON verbatim so they can be piped back into an upsert, and documents CSV
  as lossy.
- **Match the hint to the format:** `jq` for JSON, `jq -c` or `head` for NDJSON, `head` or
  `csvkit` for CSV and TSV, and for XLSX just the path, since nothing on the command line
  reads it.
- **Report what fits the format:** rows and columns for tabular exports, records for NDJSON,
  characters or lines for text.
- **A domain format follows the same pattern.** If the tool's data has a natural file format
  that other software opens, name the flag for it (`--<fmt>-out`) and keep every rule above.
- **Don't add formats for symmetry.** Each one is a serializer to test. Two is typical: JSON
  for scripts, CSV for people.

## Binary and document outputs are different

A command whose purpose is to fetch a file (download a document, render a page) is not an
export of tabular output. It takes a positional destination or `--out <path>`, and refuses to
overwrite an existing file with `EXISTS` unless `--force`. That is the one place `--force` is
house style: overwriting a local file the caller named.

## Checklist

- [ ] No `--json` stdout mode. `--json` hints at `--json-out`.
- [ ] Path only with `=`. The space form errors with the fix.
- [ ] Path validated before any work.
- [ ] Auto path in the temp dir, `0600` in a `0700` directory.
- [ ] Export ignores display caps.
- [ ] Stdout identical apart from `wrote:`, `columns:` and one hint.
- [ ] Column names equal file keys.
- [ ] The printed hint is executed in a test.
