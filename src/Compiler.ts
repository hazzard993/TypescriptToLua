import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import * as xml2js from "xml2js";

import { parseCommandLine } from "./CommandLineParser";
import { CompilerOptions } from "./CompilerOptions";
import { LuaTranspilerGML, ObjectFile, ScriptFile, RoomFile } from "./targets/Transpiler.GML";
import { LuaLibImportKind, LuaTarget } from "./Transpiler";

import { GMHelper as gmHelper } from "./GMHelper";
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
    const projectXml = projectFilePath && gmHelper.getProjectJson(projectFilePath);
    const bindingFilePath = projectFileFolder && path.join(projectFileFolder, "bindings.json");
    const bindingFileContent = fs.existsSync(bindingFilePath) && JSON.parse(fs.readFileSync(bindingFilePath, "utf8"));
    const bindings: string[] = [];

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
                    transpiler.outputFiles.forEach(outputFile => {

                        // Find the folder that this file should go to
                        let outFolder = path.dirname(outPath);
                        if (projectXml) {
                            if (outputFile instanceof ScriptFile) {
                                outFolder = path.join(projectFileFolder, "scripts");
                            } else if (outputFile instanceof ObjectFile) {
                                outFolder = path.join(projectFileFolder, "objects");
                            } else if (outputFile instanceof RoomFile) {
                                outFolder = path.join(projectFileFolder, "rooms");
                            }
                            // Create a path for gml project files to use
                            outFolder = outFolder
                                .replace(projectFileFolder, "")
                                .replace(/^\\/, "");
                        }

                        const outputFilePath = path.join(outFolder, outputFile.name);

                        // Update the xml of a .project.gmx appropriately
                        if (projectXml) {
                            bindings.push(outputFilePath);
                            if (outputFile instanceof ScriptFile) {
                                if (!projectXml.assets.scripts[0].script) {
                                    projectXml.assets.scripts[0].script = [];
                                }
                                if (projectXml.assets.scripts[0].script.indexOf(outputFilePath) === -1) {
                                    projectXml.assets.scripts[0].script.push(outputFilePath);
                                }
                            } else if (outputFile instanceof ObjectFile) {
                                if (!projectXml.assets.objects[0].object) {
                                    projectXml.assets.objects[0].object = [];
                                }
                                const outputFileName = outputFilePath.replace(".object.gmx", "");
                                if (projectXml.assets.objects[0].object.indexOf(outputFileName) === -1) {
                                    projectXml.assets.objects[0].object.push(outputFileName);
                                }
                            } else if (outputFile instanceof RoomFile) {
                                if (!projectXml.assets.rooms[0].room) {
                                    projectXml.assets.rooms[0].room = [];
                                }
                                const outputFileName = outputFilePath.replace(".room.gmx", "");
                                if (projectXml.assets.rooms[0].room.indexOf(outputFileName) === -1) {
                                    projectXml.assets.rooms[0].room.push(outputFileName);
                                }
                            }
                        }

                        // Create the file
                        ts.sys.writeFile(outputFilePath, outputFile.content);

                    });
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
        // Remove files that had been previously outputted
        if (bindingFileContent) {
            bindingFileContent.forEach((relativepath: string) => {
                const absolutePath = path.join(projectFileFolder, relativepath);
                if (bindings.indexOf(relativepath) === -1) {
                    const folder = relativepath.split("\\")[0];
                    if (folder === "objects") {
                        const index = projectXml.assets.objects[0].object.indexOf(relativepath);
                        projectXml.assets.objects[0].object.splice(index);
                    } else if (folder === "scripts") {
                        const index = projectXml.assets.scripts[0].script.indexOf(relativepath);
                        projectXml.assets.scripts[0].script.splice(index);
                    }
                    fs.unlinkSync(absolutePath);
                }
            });
        }
        if (projectXml) {
            ts.sys.writeFile(bindingFilePath, JSON.stringify(bindings));
            const xmlContent = new xml2js.Builder().buildObject(projectXml);
            ts.sys.writeFile(projectFilePath, xmlContent);
        }
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
