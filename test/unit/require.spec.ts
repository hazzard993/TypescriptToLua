import { Expect, FocusTest, Test, TestCase } from "alsatian";

import * as util from "../src/util";
import * as path from "path";
import { CompilerOptions } from "../../src/CompilerOptions";

export class RequireTests {

    @TestCase("file.ts", "./folder/Module", "folder.Module", { rootDir: "." }, false)
    @TestCase("src/file.ts", "./folder/Module", "src.folder.Module", { rootDir: "." }, false)
    @TestCase("file.ts", "folder/Module", "folder.Module", { rootDir: ".", baseUrl: "." }, false)
    @TestCase("src/file.ts", "./folder/Module", "folder.Module", { rootDir: "src" }, false)
    @TestCase("src/file.ts", "./folder/Module", "folder.Module", { rootDir: "./src" }, false)
    @TestCase("file.ts", "../Module", "", { rootDir: "./src" }, true)
    @TestCase("src/dir/file.ts", "../Module", "Module", { rootDir: "./src" }, false)
    @TestCase("src/dir/dir/file.ts", "../../dir/Module", "dir.Module", { rootDir: "./src" }, false)
    @Test("require paths root from --baseUrl or --rootDir")
    public testRequirePath(
        filePath: string,
        usedPath: string,
        expectedPath: string,
        options: CompilerOptions,
        throwsError: boolean): void {
        const regex = /require\("(.*?)"\)/;                 // This regex extracts `hello` from require("hello")
        options.rootDir = path.resolve(options.rootDir);    // This happens automatically from the command line
        if (throwsError) {
            Expect(() => util.transpileString(`import * from "${usedPath}";`, options, true, filePath)).toThrow();
        } else {
            const lua = util.transpileString(`import * from "${usedPath}";`, options, true, filePath);
            const match = regex.exec(lua);
            Expect(match[1]).toBe(expectedPath);
        }
    }

    @TestCase("$file", /(?<!")\$file/g)
    @TestCase("#file", /(?<!")#file/g)
    @TestCase(" file", /(?<!") file/g)
    @TestCase("file name", /(?<!")file name/g)
    @TestCase("file-name", /(?<!")file-name/g)
    @TestCase("$#_horrid-file name", /(?<!")\$#_horrid-file name/g)
    @Test("required files can contain special file specific symbols")
    public testRequireSpecialFilenameSymbols(filename: string, nullRegex: RegExp): void {
        const lua = util.transpileString(`import { test } from "${filename}";`, undefined, true);
        // Checks that no identifiers exist that contain the special file name symbols
        Expect(lua.match(nullRegex)).toBeNull();
    }

}