import { TSTLErrors } from "../Errors";
import { LuaTranspiler } from "../Transpiler";
import { TSHelper as tsHelper } from "../TSHelper";

import * as ts from "typescript";

export class LuaTranspilerGML extends LuaTranspiler {

    public outputFiles: { [filename: string]: string } = {};

    /** @override */
    public transpileNode(node: ts.Node): string {
        switch (node.kind) {
            case ts.SyntaxKind.TryStatement:
                throw TSTLErrors.UnsupportedKind("expression", node.kind, node);
            default:
                return super.transpileNode(node);
        }
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

    /** @override */
    public transpilePostfixUnaryExpression(node: ts.PostfixUnaryExpression): string {
        const operand = this.transpileExpression(node.operand, true);
        let operator: string;
        switch (node.operator) {
            case ts.SyntaxKind.MinusMinusToken:
                operator = "--";
                break;
            case ts.SyntaxKind.PlusPlusToken:
                operator = "++";
                break;
            default:
                throw TSTLErrors.UnsupportedKind("unary postfix operator", node.operator, node);
        }
        return `${operand}${operator}`;
    }

    /** @override */
    public transpilePrefixUnaryExpression(node: ts.PrefixUnaryExpression): string {
        const operand = this.transpileExpression(node.operand, true);
        let operator: string;
        switch (node.operator) {
            case ts.SyntaxKind.TildeToken:
                operator = "~";
                break;
            case ts.SyntaxKind.MinusMinusToken:
                operator = "--";
                break;
            case ts.SyntaxKind.ExclamationToken:
                operator = "!";
                break;
            case ts.SyntaxKind.MinusToken:
                operator = "-";
                break;
            case ts.SyntaxKind.PlusToken:
                operator = "+";
                break;
            default:
                throw TSTLErrors.UnsupportedKind("unary prefix operator", node.operator, node);
        }
        return `${operator}${operand}`;
    }

    /** @override */
    public transpileFunctionDeclaration(node: ts.FunctionDeclaration): string {
        let result = "";

        // Build script header
        const methodName = this.transpileIdentifier(node.name);
        const [paramNames, spreadIdentifier] = this.transpileParameters(node.parameters);
        result += `/// Usage:\t${methodName}(${paramNames.join(", ")})\n`;

        // Build documentation
        const type = this.checker.getTypeAtLocation(node);
        if (type.symbol) {
            type.symbol.getDocumentationComment(this.checker).forEach(comment => {
                result += `${this.indent}/// ${comment.text}\n`;
            });
        }

        // Now the body
        if (!node.body) { return result; }
        result += this.transpileFunctionBody(node.parameters, node.body, spreadIdentifier);
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
                    result += this.transpileVariableDeclaration(declaration);
                    result += `\n${this.indent}return _;`;
                    return result;
                default:
                    const expression = this.transpileExpression(node.expression);
                    return `return ${expression};`;
            }
        } else {
            return "return;";
        }
    }

    /** @override */
    public transpileVariableDeclaration(node: ts.VariableDeclaration): string {
        if (ts.isIdentifier(node.name)) {
            // Find variable identifier
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
                    const value = this.transpileExpression(node.initializer);
                    if (ts.isFunctionExpression(node.initializer) || ts.isArrowFunction(node.initializer)) {
                        // Separate declaration and assignment for functions to allow recursion
                        return `local ${identifierName}; ${identifierName} = ${value}`;
                    } else {
                        return `var ${identifierName} = ${value}`;
                    }
                }
            } else {
                return `var ${identifierName};`;
            }
        } else if (ts.isArrayBindingPattern(node.name)) {
            // Destructuring type

            // Disallow ellipsis destruction
            if (node.name.elements.some(elem => !ts.isBindingElement(elem) || elem.dotDotDotToken !== undefined)) {
                throw TSTLErrors.ForbiddenEllipsisDestruction(node);
            }

            const vars = node.name.elements.map(e => this.transpileArrayBindingElement(e)).join(",");

            // Don't unpack TupleReturn decorated functions
            if (tsHelper.isTupleReturnCall(node.initializer, this.checker)) {
                return `local ${vars}=${this.transpileExpression(node.initializer)}`;
            } else {
                return `local ${vars}=${this.transpileDestructingAssignmentValue(node.initializer)}`;
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
            return `${this.indent}${identifier}[${index++}] = ${this.transpileExpression(child)};`;
        });
        return `var ${identifier};\n${lines.join("\n")}`;
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
            return `${this.indent}${identifier}[?${key}] = ${value};`;
        });
        return `var ${identifier} = ds_map_create();\n${properties.join("\n")}`;
    }

}
