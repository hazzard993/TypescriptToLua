import { Expect, FocusTest, Test, TestCase, TestCases } from "alsatian";
import { compile } from "../../../src/Compiler";
import { CompilerOptions } from "../../../src/CompilerOptions";
import { GMHelper as gmHelper } from "../../../src/GMHelper";
import { LuaTarget } from "../../../src/Transpiler";
import { TSHelper as tsHelper } from "../../../src/TSHelper";

import mock = require("mock-fs");
import * as path from "path";
import * as ts from "typescript";
import xml2js = require("xml2js");

const minimalLib = `
interface Array<T> {}
interface Boolean {}
interface Function {}
interface IArguments {}
interface Number {}
interface Object {}
interface RegExp {}
interface String {}
`;

const tsAndExpectedOutputFiles = [
    ["function test() {}", ["test.gml"]],
    ["function func() {}", ["func.gml"]],
    ["function a() {} function b() {}", ["a.gml", "b.gml"]],
];

export class GMLCLITests {

    @TestCases(tsAndExpectedOutputFiles)
    @Test("Transpile functions to gml files in the same directory")
    public testFunctionToGml(fileContent: string,
                             expectedOutputFilePaths: string[]): void {
        mock({
            "index.ts": mock.file({
                content: fileContent,
            }),
            "lib.d.ts": mock.file({
                content: minimalLib,
            }),
            "tsconfig.json": mock.file({
                content: `
                    {
                        "compilerOptions": { "noLib": true },
                        "include": [ "*.ts" ],
                        "luaTarget": "gml",
                    }
                `,
            }),
        });
        compile(["-p", "tsconfig.json"]);
        expectedOutputFilePaths.forEach(filepath => {
            Expect(ts.sys.fileExists(filepath)).toBe(true);
        });
        mock.restore();
    }

    @TestCases(tsAndExpectedOutputFiles)
    @Test("Gml files go to the project folder's script/ directory and are referenced in the project file")
    public testGmlToScriptDirectory(fileContent: string,
                                    expectedOutputFilePaths: string[]): void {
        mock({
            "index.ts": mock.file({
                content: fileContent,
            }),
            "lib.d.ts": mock.file({
                content: minimalLib,
            }),
            "scripts": mock.directory({ items: {} }),
            "tsconfig.json": mock.file({
                content: `
                    {
                        "compilerOptions": {
                            "noLib": true,
                        },
                        "include": [
                            "*.ts",
                        ],
                        "projectFile": "Test.project.gmx",
                        "luaTarget": "gml",
                    }
                `,
            }),
        });
        const project = gmHelper.newProject();
        gmHelper.setProjectJson("Test.project.gmx", project);
        compile(["-p", "tsconfig.json"]);
        expectedOutputFilePaths.forEach(filepath => {
            Expect(() => {
                gmHelper.validateResource(path.join("scripts", filepath), "Test.project.gmx");
            }).not.toThrow();
        });
        mock.restore();
    }

}
