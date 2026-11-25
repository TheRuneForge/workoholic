#!/usr/bin/env python3
"""Wrap Node.js built-in JUnit test cases in a standard JUnit testsuite."""

from pathlib import Path
import xml.etree.ElementTree as ET


def main() -> None:
    # The report path is deliberately fixed: never accept a path from test data
    # or a command-line argument in this CI helper.
    report = Path("junit.xml")
    parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True))
    tree = ET.parse(report, parser=parser)
    root = tree.getroot()

    if root.tag == "testsuite":
        return
    if root.tag != "testsuites":
        raise SystemExit(f"{report}: expected <testsuites> or <testsuite>, got <{root.tag}>")

    # Node's reporter puts test cases directly under <testsuites>. Keep any
    # existing suites and diagnostic comments intact, and wrap only direct
    # test-case children (not nested cases or tag-like text in comments).
    cases = root.findall("testcase")
    if not cases:
        return

    suite = ET.Element("testsuite", name="node:test")
    for case in cases:
        root.remove(case)
        suite.append(case)

    suite.set("tests", str(len(cases)))
    suite.set("failures", str(sum(case.find("failure") is not None for case in cases)))
    suite.set("errors", str(sum(case.find("error") is not None for case in cases)))
    suite.set("skipped", str(sum(case.find("skipped") is not None for case in cases)))
    suite.set("time", f"{sum(float(case.get('time', '0')) for case in cases):.6f}")
    root.insert(0, suite)

    tree.write(report, encoding="utf-8", xml_declaration=True)
    print(f"Normalized {report}: {len(cases)} Node.js test cases")


if __name__ == "__main__":
    main()
