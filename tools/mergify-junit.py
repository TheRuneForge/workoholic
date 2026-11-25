#!/usr/bin/env python3
"""Wrap Node.js's built-in JUnit output in a standard JUnit testsuite."""

from pathlib import Path
import sys
import xml.etree.ElementTree as ET


def main() -> None:
    report = Path(sys.argv[1] if len(sys.argv) > 1 else "junit.xml")
    tree = ET.parse(report)
    root = tree.getroot()

    if root.tag == "testsuite":
        return
    if root.tag != "testsuites":
        raise SystemExit(f"{report}: expected <testsuites> or <testsuite>, got <{root.tag}>")

    cases = root.findall("testcase")
    if not cases:
        if root.findall("testsuite"):
            return
        raise SystemExit(f"{report}: no <testcase> or <testsuite> entries found")

    suite = ET.Element("testsuite", name="node:test")
    for case in cases:
        root.remove(case)
        suite.append(case)

    suite_cases = suite.findall("testcase")
    suite.set("tests", str(len(suite_cases)))
    suite.set("failures", str(sum(case.find("failure") is not None for case in suite_cases)))
    suite.set("errors", str(sum(case.find("error") is not None for case in suite_cases)))
    suite.set("skipped", str(sum(case.find("skipped") is not None for case in suite_cases)))
    suite.set("time", f"{sum(float(case.get('time', '0')) for case in suite_cases):.6f}")
    root.insert(0, suite)

    tree.write(report, encoding="utf-8", xml_declaration=True)
    print(f"Normalized {report}: {len(suite_cases)} Node.js test cases")


if __name__ == "__main__":
    main()
