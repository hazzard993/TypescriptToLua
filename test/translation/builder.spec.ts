import { Expect, Test, TestCases, FocusTest } from "alsatian";

import * as util from "../src/util";

import * as fs from "fs";
import * as path from "path";
import { LuaTarget, LuaLibImportKind } from "../../src/Transpiler";
import { CompilerOptions } from "typescript";

let files: string[][] = [];
let fileContents: {[key: string]: Buffer} = {};
let fileTestType: {[key: string]: "lua" | "gml"} = {};

let tsPath = path.join(__dirname, "./ts/");
let luaPath = path.join(__dirname, "./lua/")
let gmlPath = path.join(__dirname, "./gml/")

let tsFiles = fs.readdirSync(tsPath);
let luaFiles = fs.readdirSync(luaPath);
let gmlFiles = fs.readdirSync(gmlPath);

tsFiles.forEach(
    (tsFile, i) => {
        // ignore non ts files
        if (path.extname(tsFile) !== '.ts') {
            return;
        }
        let luaPart = luaFiles.indexOf(tsFile.replace('.ts', '.lua'));
        let gmlPart = gmlFiles.indexOf(tsFile.replace('.ts', '.gml'));
        if (luaPart === -1 && gmlPart === -1) {
            throw new Error("Missing lua or gml counter part for test file: " + tsFile)
        }
        if (luaPart != -1) {
            let luaFile = luaFiles[luaPart];
            let luaFileAbsolute = path.join(luaPath, luaFile);
            let tsFileAbsolute = path.join(tsPath, tsFile);
            files.push([tsFile, luaFile]);
            fileContents[tsFile] = fs.readFileSync(tsFileAbsolute);
            fileContents[luaFile] = fs.readFileSync(luaFileAbsolute);
            fileTestType[tsFile] = "lua";
        }
        if (gmlPart != -1) {
            let gmlFile = gmlFiles[gmlPart];
            let gmlFileAbsolute = path.join(gmlPath, gmlFile);
            let tsFileAbsolute = path.join(tsPath, tsFile);
            files.push([tsFile, gmlFile]);
            fileContents[tsFile] = fs.readFileSync(tsFileAbsolute);
            fileContents[gmlFile] = fs.readFileSync(gmlFileAbsolute);
            fileTestType[tsFile] = "gml";
        }
    }
);

function BufferToTestString(b: Buffer): string {
    return b.toString().trim().split("\r\n").join("\n")
}

export class FileTests {

    // @FocusTest
    @TestCases(files)
    @Test("Transformation Tests")
    public transformationTests(tsFile: string, translationFile: string) {
        let options: CompilerOptions;
        const a = fileContents[tsFile];
        let b: Buffer;
        switch (fileTestType[tsFile]) {
            case "gml":
                options = {
                    luaLibImport: LuaLibImportKind.Require,
                    luaTarget: LuaTarget.LuaGML,
                };
                b = fileContents[translationFile];
                break;
            case "lua":
                options = {
                    luaLibImport: LuaLibImportKind.Require,
                    luaTarget: LuaTarget.Lua53,
                };
                b = fileContents[translationFile]
        }
        Expect(util.transpileString(BufferToTestString(a), options)).toEqual(BufferToTestString(b));
    }

}
