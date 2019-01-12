import path = require("path");
import * as xml2js from "xml2js";
import { TSTLErrors } from "../Errors";
import { GMXObject } from "../GMResources";
import { LuaTranspiler } from "../Transpiler";
import { TSHelper as tsHelper } from "../TSHelper";

import * as ts from "typescript";
import { Decorator, DecoratorKind } from "../Decorator";
import { GMBuilder as gmBuilder } from "../GMBuilder";

const events = {
    beginStep: [3, 1],
    create: [0, 0],
    destroy: [1, 0],
    draw: [8, 0],
    endStep: [3, 2],
    step: [3, 0],
};

export interface OutputFile {
    /**
     * The relative path to this file from the .project.gmx
     */
    rpath: string;
    /**
     * This contents of this file in plain text
     */
    content: string;
    /**
     * Returns the reference to this resource within the xml file
     */
    getXmlName(): string;
    /**
     * Returns the filename this resource should have
     */
    getFileName(): string;
}

export class ScriptFile implements OutputFile {
    constructor(public rpath: string, public content: string) {}
    /** @override */
    public getXmlName(): string {
        return path.join("scripts", this.rpath);
    }
    /** @override */
    public getFileName(): string {
        return path.basename(this.rpath);
    }
}

export class ObjectFile implements OutputFile {
    constructor(public rpath: string, public content: string) { }
    /** @override */
    public getXmlName(): string {
        return path.join("objects", this.rpath.replace(".object.gmx", ""));
    }
    /** @override */
    public getFileName(): string {
        return path.basename(this.rpath);
    }
}

export class RoomFile implements OutputFile {
    constructor(public rpath: string, public content: string) { }
    /** @override */
    public getXmlName(): string {
        return path.join("rooms", this.rpath.replace(".room.gmx", ""));
    }
    /** @override */
    public getFileName(): string {
        return path.basename(this.rpath);
    }
}

export class LuaTranspilerGML extends LuaTranspiler {

    public outputFiles: OutputFile[] = [];

    /** @override */
    public transpileNode(node: ts.Node): string {
        switch (node.kind) {
            case ts.SyntaxKind.TryStatement:
                throw TSTLErrors.UnsupportedKind("expression", node.kind, node);
            default:
                return super.transpileNode(node);
        }
    }

    /**
     * Transpiles an expression from the TypeScript AST.
     * @param node The node to transpile from the AST.
     * @throws Throws an error if the node has no gml equivalent.
     * @override
     */
    public transpileExpression(node: ts.Node): string {
        switch (node.kind) {
            case ts.SyntaxKind.ArrayLiteralExpression:
            case ts.SyntaxKind.FunctionExpression:
            case ts.SyntaxKind.ObjectLiteralExpression:
                throw TSTLErrors.UnsupportedKind("expression", node.kind, node);
            default:
                return super.transpileExpression(node);
        }
    }

    /** @override */
    public transpileClass(node: ts.ClassLikeDeclarationBase, nameOverride?: string): string {
        const className = this.transpileIdentifier(node.name);
        const extendsType = tsHelper.getExtendedType(node, this.checker);
        if (extendsType) {
            const decorators = tsHelper.getCustomDecorators(extendsType, this.checker);
            if (decorators.has(DecoratorKind.Room)) {
                const room = gmBuilder.newRoom();
                node.members.forEach(member => {
                    if (ts.isMethodDeclaration(member)) {
                        const methodName = this.transpileIdentifier(member.name as ts.Identifier);
                        switch (methodName) {
                            case "creationCode":
                                room.room.code = this.transpileBlock(member.body);
                        }
                    }
                });
                const roomFile = new RoomFile(`${className}.room.gmx`, new xml2js.Builder().buildObject(room));
                this.outputFiles.push(roomFile);
                return "";
            } else if (decorators.has(DecoratorKind.Object)) {
                const obj = gmBuilder.newObject();
                node.members.forEach(member => {
                    if (ts.isMethodDeclaration(member)) {
                        const methodName = this.transpileIdentifier(member.name as ts.Identifier);
                        const event = events[methodName];
                        if (event !== undefined) {
                            const result = this.transpileBlock(member.body);
                            obj.object.events.event.push(gmBuilder.newEvent(event[0], event[1], result));
                        } else {
                            const scriptName = `${className}_${methodName}`;
                            const functionDeclaration = ts.createFunctionDeclaration(
                                member.decorators,
                                member.modifiers,
                                member.asteriskToken,
                                scriptName,
                                member.typeParameters,
                                member.parameters,
                                member.type,
                                member.body);
                            return this.transpileFunctionDeclaration(functionDeclaration);
                        }
                    }
                });
                const contents = new xml2js.Builder().buildObject(obj);
                const objectFile = new ObjectFile(`${className}.object.gmx`, contents);
                this.outputFiles.push(objectFile);
            }
        }
        return "";
    }

    /** @override */
    public transpileIf(node: ts.IfStatement): string {
        let result = "";

        // if ... { ...
        const condition = this.transpileExpression(node.expression);
        result += `${this.indent}if ${condition}\n`;
        result += `${this.indent}{\n`;
        this.pushIndent();
        result += this.transpileStatement(node.thenStatement);
        this.popIndent();

        // } else if ... { ...
        let elseStatement = node.elseStatement;
        while (elseStatement && ts.isIfStatement(elseStatement)) {
            const elseIfCondition = this.transpileExpression(elseStatement.expression);
            result += `${this.indent}}\n`;
            result += `${this.indent}else if ${elseIfCondition}\n`;
            result += `${this.indent}{\n`;
            this.pushIndent();
            result += this.transpileStatement(elseStatement.thenStatement);
            this.popIndent();
            elseStatement = elseStatement.elseStatement;
        }

        // } else { ...
        if (elseStatement) {
            result += `${this.indent}}\n`;
            result += `${this.indent}else\n`;
            result += `${this.indent}{\n`;
            this.pushIndent();
            result += this.transpileStatement(elseStatement);
            this.popIndent();
        }

        // }
        result += `${this.indent}}\n`;
        return result;
    }

    /** @override */
    public transpileWhile(node: ts.WhileStatement): string {
        const condition = this.transpileExpression(node.expression);
        let result = "";
        result += `${this.indent}while ${condition}\n`;
        result += `${this.indent}{\n`;
        this.pushIndent();
        result += this.transpileStatement(node.statement);
        this.popIndent();
        result += `${this.indent}}\n`;
        return result;
    }

    /** @override */
    public transpileFor(node: ts.ForStatement): string {
        if (node.initializer && node.condition && node.incrementor) {
            const declarationList = node.initializer as ts.VariableDeclarationList;
            if (declarationList.declarations.length === 1) {
                let result = "";
                const initializer = this.transpileVariableDeclaration(declarationList.declarations[0]);
                const condition = this.transpileExpression(node.condition);
                const incrementor = this.transpileExpression(node.incrementor);
                result += `${this.indent}for (${initializer}; ${condition}; ${incrementor})\n`;
                result += `${this.indent}{\n`;
                this.pushIndent();
                result += this.transpileStatement(node.statement);
                this.popIndent();
                result += `${this.indent}}\n`;
                return result;
            } else if (declarationList.declarations.length > 1) {
                throw TSTLErrors.UnsupportedKind("multiple for loop initializers", node.kind, node);
            }
        } else {
            throw TSTLErrors.UnsupportedKind("GML needs an init., cond. and inc", node.kind, node);
        }
    }

    /**
     * Transpiles a unary operator to the equivilent in GML
     * @param node The unary operator node from the AST
     */
    public transpileUnaryOperator(
        node: ts.PostfixUnaryExpression | ts.PrefixUnaryOperator): string {
        switch (node) {
            case ts.SyntaxKind.MinusMinusToken:
                return "--";
            case ts.SyntaxKind.PlusPlusToken:
                return "++";
            case ts.SyntaxKind.TildeToken:
                return "~";
            case ts.SyntaxKind.ExclamationToken:
                return "!";
            case ts.SyntaxKind.MinusToken:
                return "-";
            case ts.SyntaxKind.PlusToken:
                return "+";
            default:
                throw TSTLErrors.UnsupportedKind("unary prefix/postfix operator", node.operator, node);
        }
    }

    /** @override */
    public transpilePostfixUnaryExpression(node: ts.PostfixUnaryExpression): string {
        const operand = this.transpileExpression(node.operand, true);
        const operator = this.transpileUnaryOperator(node.operator);
        return `${operand}${operator}`;
    }

    /** @override */
    public transpilePrefixUnaryExpression(node: ts.PrefixUnaryExpression): string {
        const operand = this.transpileExpression(node.operand, true);
        const operator = this.transpileUnaryOperator(node.operator);
        return `${operator}${operand}`;
    }

    /** @override */
    public transpileFunctionDeclaration(node: ts.FunctionDeclaration): string {
        let result = "";

        // Build script header
        const methodName = this.transpileIdentifier(node.name);
        const parameters = ts.createNodeArray(node.parameters.filter(param => {
            const parameter = param.name as ts.Identifier;
            return parameter.originalKeywordKind !== ts.SyntaxKind.ThisKeyword;
        }));
        const [paramNames, spreadIdentifier] = this.transpileParameters(parameters, undefined);
        result += `/// Usage:  ${methodName}(${paramNames.join(", ")})\n`;

        // Build documentation
        const type = this.checker.getTypeAtLocation(node);
        if (type.symbol) {
            type.symbol.getDocumentationComment(this.checker).forEach(comment => {
                result += `${this.indent}/// ${comment.text}\n`;
            });
        }

        // Now the body
        if (!node.body) { return result; }
        result += this.transpileFunctionBody(parameters, node.body, spreadIdentifier);
        const scriptFile = new ScriptFile(`${methodName}.gml`, result);
        this.outputFiles.push(scriptFile);
        return result;
    }

    /**
     * Transpiles function parameters to the contents of a GML script file that works the same way.
     * @param parameters The parameters from the AST
     * @param body The function's body from the AST
     * @param spreadIdentifier Unused
     * @see transpileParameters
     * @see transpileBlock
     * @override
     */
    public transpileFunctionBody(
        parameters: ts.NodeArray<ts.ParameterDeclaration>,
        body: ts.Block,
        spreadIdentifier: string = ""): string {
        let result = "";
        result += this.transpileFunctionParameters(parameters);
        result += this.transpileBlock(body);
        return result;
    }

    public transpileFunctionParameters(parameters: ts.NodeArray<ts.ParameterDeclaration>): string {
        let result = "";
        let index = 0;
        parameters.forEach(param => {
            const name = this.transpileIdentifier(param.name as ts.Identifier);
            if (param.initializer || param.questionToken) {
                if (param.initializer) {
                    const expression = this.transpileExpression(param.initializer);
                    result += `${this.indent}var ${name} = ${expression};\n`;
                } else if (param.questionToken) {
                    result += `${this.indent}var ${name} = undefined;\n`;
                }
                result += `${this.indent}if argument_count >= ${index}\n`;
                result += `${this.indent}{\n`;
                this.pushIndent();
                result += `${this.indent}${name} = argument[${index++}];\n`;
                this.popIndent();
                result += `${this.indent}}\n`;
            } else {
                result += `${this.indent}var ${name} = argument[${index++}];\n`;
            }
        });
        return result;
    }

    /**
     * Transpiles the return statement to one that works in GML.
     * @param node The return statement from the AST
     * @returns A string for the transpiled return statement. Ends with a semicolon
     * @override
     */
    public transpileReturn(node: ts.ReturnStatement): string {
        if (node.expression) {
            switch (node.expression.kind) {
                case ts.SyntaxKind.ArrayLiteralExpression:
                case ts.SyntaxKind.ObjectLiteralExpression:
                    let result = "";
                    const declaration = ts.createVariableDeclaration("_", undefined, node.expression);
                    result += `${this.transpileVariableDeclaration(declaration)};\n`;
                    result += `${this.indent}return _;`;
                    return result;
                default:
                    const expression = this.transpileExpression(node.expression);
                    return `return ${expression};`;
            }
        } else {
            return "return;";
        }
    }

    /**
     * Transpiles the variable declaration statement to one that works in GML.
     * @param node The variable declaration from the AST
     * @returns A transpiled string for the variable declaration. Needs semicolon at the end
     * @override
     */
    public transpileVariableDeclaration(node: ts.VariableDeclaration): string {
        if (ts.isIdentifier(node.name)) {
            // let x = ...;
            const identifierName = this.transpileIdentifier(node.name);
            if (node.initializer) {
                if (ts.isArrayLiteralExpression(node.initializer)) {
                    // Array literals must created prior to use
                    const arrayLiteralExpression = node.initializer as ts.ArrayLiteralExpression;
                    return this.transpileArrayLiteral(arrayLiteralExpression, identifierName);
                } else if (ts.isObjectLiteralExpression(node.initializer)) {
                    // Object literals must created prior to use
                    const objectLiteralExpression = node.initializer as ts.ObjectLiteralExpression;
                    return this.transpileObjectLiteral(objectLiteralExpression, identifierName);
                } else {
                    return `var ${identifierName} = ${this.transpileExpression(node.initializer)}`;
                }
            } else {
                return `var ${identifierName}`;
            }
        } else if (ts.isArrayBindingPattern(node.name)) {
            if (node.initializer) {
                if (ts.isArrayLiteralExpression(node.initializer)) {
                    // let [x, y] = [1, 2];
                    let index = 0;
                    const declarations = node.name.elements.map(element => {
                        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                            const initializer = node.initializer as ts.ArrayLiteralExpression;
                            const expression = this.transpileExpression(initializer.elements[index]);
                            const identifier = this.transpileIdentifier(element.name);
                            index++;
                            return `${this.indent}var ${identifier} = ${expression}`;
                        } else if (ts.isOmittedExpression(element)) {
                            index++;
                            return undefined;
                        }
                    }).filter(element => element);
                    return declarations.join(";\n");
                } else if (ts.isIdentifier(node.initializer)) {
                    // let [x, y] = array;
                    const identifier = this.transpileIdentifier(node.initializer);
                    let index = 0;
                    const declarations = node.name.elements.map(element => {
                        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                            const variableIdentifier = this.transpileIdentifier(element.name);
                            return `${this.indent}var ${variableIdentifier} = ${identifier}[${index++}]`;
                        } else if (ts.isOmittedExpression(element)) {
                            index++;
                            return undefined;
                        }
                    }).filter(element => element);
                    return declarations.join(";\n");
                } else if (ts.isCallExpression(node.initializer)) {
                    let result = "";
                    const declaration = ts.createVariableDeclaration("_", undefined, node.initializer);
                    result += `${this.transpileVariableDeclaration(declaration)};\n`;
                    let index = 0;
                    const declarations = node.name.elements.map(element => {
                        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                            const variableIdentifier = this.transpileIdentifier(element.name);
                            return `${this.indent}var ${variableIdentifier} = _[${index++}]`;
                        } else if (ts.isOmittedExpression(element)) {
                            index++;
                            return undefined;
                        }
                    }).filter(element => element);
                    result += declarations.join(";\n");
                    return result;
                }
            } else {
                throw TSTLErrors.UnsupportedKind("assignment initializer", node.name.kind, node);
            }
        } else {
            throw TSTLErrors.UnsupportedKind("variable declaration", node.name.kind, node);
        }
    }

    /**
     * Transpiles an ArrayLiteralExpression to an equivalent GML array.
     * This array is immediately declared with an identifier.
     * @param node The ObjectLiteralExpression from the AST
     * @param identifier The identifier name of the new object literal
     * @override
     */
    public transpileArrayLiteral(node: ts.ArrayLiteralExpression, identifier?: string): string {
        let index = 0;
        const lines = node.elements.map(child => {
            return `${this.indent}${identifier}[${index++}] = ${this.transpileExpression(child)}`;
        });
        return `var ${identifier};\n${lines.join(";\n")}`;
    }

    /**
     * Transpiles an ObjectLiteralExpression to an equivalent GML ds_map.
     * This ds map HAS to be declared and should be deleted if it is no longer needed.
     * @param node The ObjectLiteralExpression from the AST
     * @param identifier The identifier name of the new object literal
     * @override
     */
    public transpileObjectLiteral(node: ts.ObjectLiteralExpression, identifier?: string): string {
        const properties = node.properties.map(element => {
            let key: string;
            let value: string;
            if (ts.isIdentifier(element.name)) {
                key = `"${this.transpileIdentifier(element.name)}"`;
            } else if (ts.isComputedPropertyName(element.name)) {
                const computedPropertyName = element.name as ts.ComputedPropertyName;
                key = this.transpileExpression(computedPropertyName.expression);
            } else {
                key = this.transpileExpression(element.name);
            }
            if (ts.isPropertyAssignment(element)) {
                value = this.transpileExpression(element.initializer);
            } else if (ts.isShorthandPropertyAssignment(element)) {
                value = `${this.transpileIdentifier(element.name)}`;
            } else {
                throw TSTLErrors.UnsupportedKind("object literal element", element.kind, node);
            }
            return `${this.indent}${identifier}[?${key}] = ${value}`;
        });
        return `var ${identifier} = ds_map_create();\n${properties.join(";\n")}`;
    }

}
