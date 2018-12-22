import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import * as xml2js from 'xml2js';

import { parseCommandLine } from "./CommandLineParser";
import { CompilerOptions } from "./CompilerOptions";
import { LuaTranspilerGML } from "./targets/Transpiler.GML";
import { LuaLibImportKind, LuaTarget } from "./Transpiler";

import { createTranspiler } from "./TranspilerFactory";

export function compile(argv: string[]): void {
    const commandLine = parseCommandLine(argv);
    /* istanbul ignore if: tested in test/compiler/watchmode.spec with subproccess */
    if (commandLine.options.watch) {
        watchWithOptions(commandLine.fileNames, commandLine.options);
    } else {
        compileFilesWithOptions(commandLine.fileNames, commandLine.options);
    }
}

/* istanbul ignore next: tested in test/compiler/watchmode.spec with subproccess */
export function watchWithOptions(fileNames: string[], options: CompilerOptions): void {
    let host: ts.WatchCompilerHost<ts.SemanticDiagnosticsBuilderProgram>;
    let config = false;
    if (options.project) {
        config = true;
        host = ts.createWatchCompilerHost(
            options.project,
            options,
            ts.sys,
            ts.createSemanticDiagnosticsBuilderProgram
        );
    } else {
        host = ts.createWatchCompilerHost(
            fileNames,
            options,
            ts.sys,
            ts.createSemanticDiagnosticsBuilderProgram
        );
    }

    host.afterProgramCreate = program => {
        const status = emitFilesAndReportErrors(program.getProgram());
        const errorDiagnostic: ts.Diagnostic = {
            category: undefined,
            code: 6194,
            file: undefined,
            length: 0,
            messageText: "Found 0 errors. Watching for file changes.",
            start: 0,
        };
        if (status !== 0) {
            errorDiagnostic.messageText = "Found Errors. Watching for file changes.";
            errorDiagnostic.code = 6193;
        }
        host.onWatchStatusChange(
            errorDiagnostic,
            host.getNewLine(),
            program.getCompilerOptions()
        );
    };

    if (config) {
        ts.createWatchProgram(
            host as ts.WatchCompilerHostOfConfigFile<ts.SemanticDiagnosticsBuilderProgram>);
    } else {
        ts.createWatchProgram(
            host as ts.WatchCompilerHostOfFilesAndCompilerOptions<ts.SemanticDiagnosticsBuilderProgram>);
    }
}

export function compileFilesWithOptions(fileNames: string[], options: CompilerOptions): void {
    const program = ts.createProgram(fileNames, options);

    emitFilesAndReportErrors(program);
}

function emitFilesAndReportErrors(program: ts.Program): number {
    const options = program.getCompilerOptions() as CompilerOptions;

    const checker = program.getTypeChecker();

    // Get all diagnostics, ignore unsupported extension
    const diagnostics = ts.getPreEmitDiagnostics(program).filter(diag => diag.code !== 6054);
    diagnostics.forEach(reportDiagnostic);

    // If there are errors dont emit
    if (diagnostics.filter(diag => diag.category === ts.DiagnosticCategory.Error).length > 0) {
        if (!options.watch) {
            process.exit(1);
        } else {
            return 1;
        }
    }

    const gmlTarget = options.luaTarget === LuaTarget.LuaGML;
    const projectFilePath = options.projectFile && path.resolve(options.projectFile);
    const projectFileFolder = options.projectFile && path.dirname(projectFilePath);
    const projectFileContent = projectFilePath && fs.readFileSync(projectFilePath, "utf8");
    let projectXml: any;
    if (projectFileContent) {
        xml2js.parseString(projectFileContent, (err, result) => {
            projectXml = result;
        });
    }

    program.getSourceFiles().forEach(sourceFile => {

        if (!sourceFile.isDeclarationFile) {
            try {
                const rootDir = options.rootDir;

                // Transpile AST
                const transpiler = createTranspiler(checker, options, sourceFile);
                const content = transpiler.transpileSourceFile();

                let outPath = sourceFile.fileName;
                if (options.outDir !== options.rootDir) {
                    const relativeSourcePath = path.resolve(sourceFile.fileName)
                                                   .replace(path.resolve(rootDir), "");
                    outPath = path.join(options.outDir, relativeSourcePath);
                }

                // change extension or rename to outFile
                if (options.outFile) {
                    if (path.isAbsolute(options.outFile)) {
                        outPath = options.outFile;
                    } else {
                        // append to workingDir or outDir
                        outPath = path.resolve(options.outDir, options.outFile);
                    }
                } else {
                    const fileNameLua = path.basename(outPath, path.extname(outPath)) + ".lua";
                    outPath = path.join(path.dirname(outPath), fileNameLua);
                }

                if (transpiler instanceof LuaTranspilerGML) {
                    // If using the GML transpiler, output gml
                    // All gml files are placed in /scripts/
                    let outFolder: string;
                    if (projectFileFolder) {
                        outFolder = path.join(projectFileFolder, "scripts");
                    } else {
                        outFolder = path.dirname(outPath);
                    }
                    for (const basefilename in transpiler.outputFiles) {
                        // Get full path to where the gml file should go
                        const filename = path.join(outFolder, `${basefilename}.gml`);
                        if (projectXml) {
                            // Output gml must be in subdirectories of .project.gmx
                            if (filename.includes(projectFileFolder)) {
                                const relPath = filename                // Full path to gml output file
                                    .replace(projectFileFolder, "")     // Remove the project's absolute path
                                    .replace(/^\\/, "");                // Remove \ at start
                                // console.log(relPath);
                                if (projectXml.assets.scripts[0].script.indexOf(relPath) === -1) {
                                    projectXml.assets.scripts[0].script.push(relPath);
                                }
                            } else {
                                throw new Error(`${filename} is not within ${projectFilePath}`);
                            }
                        }
                        ts.sys.writeFile(filename, transpiler.outputFiles[basefilename]);
                    }
                } else {
                    // Write output
                    // change extension or rename to outFile
                    if (options.outFile) {
                        if (path.isAbsolute(options.outFile)) {
                            outPath = options.outFile;
                        } else {
                            // append to workingDir or outDir
                            outPath = path.resolve(options.outDir, options.outFile);
                        }
                    } else {
                        const fileNameLua = path.basename(outPath, path.extname(outPath)) + ".lua";
                        outPath = path.join(path.dirname(outPath), fileNameLua);
                    }
                    ts.sys.writeFile(outPath, content);
                }
            } catch (exception) {
                /* istanbul ignore else: Testing else part would require to add a bug/exception to our code */
                if (exception.node) {
                    const pos = ts.getLineAndCharacterOfPosition(sourceFile, exception.node.pos);
                    // Graciously handle transpilation errors
                    console.error("Encountered error parsing file: " + exception.message);
                    console.error(
                        sourceFile.fileName + " line: " + (1 + pos.line) + " column: " + pos.character + "\n" +
                        exception.stack
                    );
                    process.exit(1);
                } else {
                    throw exception;
                }
            }
        }
    });

    if (gmlTarget) {
        console.log(`${options.projectFile} updated`);
        const xmlContent = new xml2js.Builder().buildObject(projectXml);
        ts.sys.writeFile(projectFilePath, xmlContent);
    }

    // Copy lualib to target dir
    if (options.luaLibImport === LuaLibImportKind.Require || options.luaLibImport === LuaLibImportKind.Always) {
        fs.copyFileSync(
            path.resolve(__dirname, "../dist/lualib/lualib_bundle.lua"),
            path.join(options.outDir, "lualib_bundle.lua")
        );
    }

    return 0;
}

const libSource = fs.readFileSync(path.join(path.dirname(require.resolve("typescript")), "lib.es6.d.ts")).toString();

export function transpileString(str: string,
                                options: CompilerOptions = {
                                    luaLibImport: LuaLibImportKind.Require,
                                    luaTarget: LuaTarget.Lua53,
                                }): string {
    const compilerHost = {
        directoryExists: () => true,
        fileExists: (fileName): boolean => true,
        getCanonicalFileName: fileName => fileName,
        getCurrentDirectory: () => "",
        getDefaultLibFileName: () => "lib.es6.d.ts",
        getDirectories: () => [],
        getNewLine: () => "\n",

        getSourceFile: (filename, languageVersion) => {
            if (filename === "file.ts") {
                return ts.createSourceFile(filename, str, ts.ScriptTarget.Latest, false);
            }
            if (filename === "lib.es6.d.ts") {
                return ts.createSourceFile(filename, libSource, ts.ScriptTarget.Latest, false);
            }
            return undefined;
        },

        readFile: () => "",

        useCaseSensitiveFileNames: () => false,
        // Don't write output
        writeFile: (name, text, writeByteOrderMark) => null,
    };
    const program = ts.createProgram(["file.ts"], options, compilerHost);

    const result = createTranspiler(program.getTypeChecker(),
                                    options,
                                    program.getSourceFile("file.ts")).transpileSourceFile();
    return result.trim();
}

function reportDiagnostic(diagnostic: ts.Diagnostic): void {
    if (diagnostic.file) {
        const { line, character } =
            diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        console.log(
            `${diagnostic.code}: ${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`
        );
    } else {
        console.log(
            `${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
        );
    }
}
