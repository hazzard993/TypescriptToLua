import { LuaTranspiler } from "../Transpiler";
import { TSHelper as tsHelper } from "../TSHelper";
import { TSTLErrors } from "../Errors";

import * as ts from "typescript";

export class LuaTranspilerGML extends LuaTranspiler {

    /** @override */
    public transpileExpression(node: ts.Node, brackets?: boolean, params?: { identifier: string, preString: string }): string {
        switch (node.kind) {
            case ts.SyntaxKind.ObjectLiteralExpression:
            case ts.SyntaxKind.ArrayLiteralExpression:
                // These have to be declared before use
                const expression = node as ts.Expression;
                const declaration = ts.createVariableDeclaration(params.identifier, undefined, expression);
                params.preString += this.transpileVariableDeclaration(declaration);
                return params.identifier;
            default:
                return super.transpileExpression(node, brackets);
        }
    }

    /**
     * Transpiles the return statement to one that works in GML.
     * @param node The return statement from the AST
     * @override
     */
    public transpileReturn(node: ts.ReturnStatement): string {
        if (node.expression) {
            let params = {
                identifier: "_",    // If an identifier is created, it will contain this name
                preString: "",      // Contains a string that should be before the transpiled expression
            }
            let result = `return ${this.transpileExpression(node.expression, undefined, params)};`;
            if (params.preString.length > 0) {
                params.preString += this.indent;
            }
            return `${params.preString}${result}`;
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
        let array = `var ${identifier};\n`;
        let index = 0;
        node.elements.forEach(child => {
            array += `${this.indent}${identifier}[${index}] = ${this.transpileExpression(child)};\n`;
            index++;
        });
        return array;
    }

    /**
     * Transpiles an ObjectLiteralExpression to an equivalent GML ds_map.
     * This ds map HAS to be declared and should be deleted if it is no longer needed.
     * @param node The ObjectLiteralExpression from the AST
     * @param identifier The identifier name of the new object literal
     * @override
     */
    public transpileObjectLiteral(node: ts.ObjectLiteralExpression, identifier?: string): string {
        let result = `var ${identifier} = ds_map_create();\n`;
        node.properties.forEach(element => {
            let key: string, value: string;
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
            result += `${this.indent}${identifier}[?${key}] = ${value};\n`;
        });
        return result;
    }

}
