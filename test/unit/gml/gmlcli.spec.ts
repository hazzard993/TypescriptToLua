import { Expect, FocusTest, Test, TestCase, TestCases } from "alsatian";
import { compile } from "../../../src/Compiler";
import { CompilerOptions } from "../../../src/CompilerOptions";
import { GMBuilder as gmBuilder } from "../../../src/GMBuilder";
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

export class GMLCLITests {

    @TestCase("function test() {}", ["test.gml"])
    @TestCase("function func() {}", ["func.gml"])
    @TestCase("function a() {} function b() {}", ["a.gml", "b.gml"])
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

    @TestCase("function test() {}", ["scripts\\test.gml"])
    @TestCase("function func() {}", ["scripts\\func.gml"])
    @TestCase("function a() {} function b() {}", ["scripts\\a.gml", "scripts\\b.gml"])
    @TestCase("/** @Room */declare class Room {}class room0 extends Room {}", ["rooms\\room0.room.gmx"])
    @TestCase("/** @Object */declare class Object {}class Player extends Object {}", ["objects\\Player.object.gmx"])
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
        const project = gmBuilder.newProject();
        gmHelper.setProjectJson("Test.project.gmx", project);
        compile(["-p", "tsconfig.json"]);
        expectedOutputFilePaths.forEach(filepath => {
            Expect(() => {
                gmHelper.validateResource(filepath, "Test.project.gmx");
            }).not.toThrow();
        });
        mock.restore();
    }

    @TestCase("function test() {} function func() {}", "",
              ["scripts\\test.gml", "scripts\\func.gml"], [], ["scripts\\func.gml", "scripts\\test.gml"])
    @TestCase("function test() {}", "function func() {}",
              ["scripts\\test.gml"], ["scripts\\func.gml"], ["scripts\\test.gml"])
    @TestCase("/** @Object */declare class GMObject {} class A extends GMObject {}",
              "/** @Object */declare class GMObject {} class B extends GMObject {}",
              ["objects\\A.object.gmx"], ["objects\\B.object.gmx"], ["objects\\A.object.gmx"])
    @TestCase("/** @Object */declare class GMObject {} class A extends GMObject {}",
              "function x() {}",
              ["objects\\A.object.gmx"], ["scripts\\x.gml"], ["objects\\A.object.gmx"])
    @Test("Test that bindings are added and removed appropriately")
    public testBindings(source: string,
                        sourceTwo: string,
                        outputFiles: string[],
                        outputFilesTwo: string[],
                        ommittedFilesTwo: string[]): void {
        mock({
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
        const project = gmBuilder.newProject();
        gmHelper.setProjectJson("Test.project.gmx", project);
        ts.sys.writeFile("index.ts", source);
        compile(["-p", "tsconfig.json"]);
        let bindings: string[] = JSON.parse(ts.sys.readFile("bindings.json", "utf8"));
        for (const relativeOutputPath of outputFiles) {
            const fullPath = path.resolve(".", relativeOutputPath);
            Expect(bindings).toContain(fullPath);
        }
        ts.sys.writeFile("index.ts", sourceTwo);
        compile(["-p", "tsconfig.json"]);
        bindings = JSON.parse(ts.sys.readFile("bindings.json", "utf8"));
        for (const relativeOutputPath of outputFilesTwo) {
            const fullPath = path.resolve(".", relativeOutputPath);
            Expect(bindings).toContain(fullPath);
        }
        bindings = JSON.parse(ts.sys.readFile("bindings.json", "utf8"));
        for (const relativeOutputPath of ommittedFilesTwo) {
            const fullPath = path.resolve(".", relativeOutputPath);
            Expect(bindings).not.toContain(fullPath);
        }
        mock.restore();
    }

}
