#!/usr/bin/env python3
"""Wrap Node.js's built-in JUnit output in a standard JUnit testsuite."""

from pathlib import Path
import re
import sys


def main() -> None:
    report = Path(sys.argv[1] if len(sys.argv) > 1 else "junit.xml")
    xml = report.read_text(encoding="utf-8")

    opening = re.search(r"<testsuites(?:\s[^>]*)?>", xml)
    closing = xml.rfind("</testsuites>")
    if opening is None or closing < opening.end():
        raise SystemExit(f"{report}: expected a <testsuites> root element")

    content = xml[opening.end() : closing]
    if re.search(r"<testsuite\b", content):
        return

    def count(tag: str) -> int:
        return len(re.findall(rf"<{tag}(?:\s|/?>)", content))

    tests = count("testcase")
    if tests == 0:
        raise SystemExit(f"{report}: no <testcase> or <testsuite> entries found")

    attributes = (
        f'name="node:test" tests="{tests}" '
        f'failures="{count("failure")}" errors="{count("error")}" '
        f'skipped="{count("skipped")}"'
    )
    normalized = (
        xml[: opening.end()]
        + f"<testsuite {attributes}>"
        + content
        + "</testsuite>"
        + xml[closing:]
    )
    report.write_text(normalized, encoding="utf-8")
    print(f"Normalized {report}: {tests} Node.js test cases")


if __name__ == "__main__":
    main()
