import * as ts from "typescript";
import * as lua from "../../LuaAST";
import { transformBuiltinIdentifierExpression } from "../builtins";
import { FunctionVisitor, TransformationContext } from "../context";
import { isForRangeType } from "../utils/annotations";
import { InvalidForRangeCall } from "../utils/errors";
import { createExportedIdentifier, getIdentifierExportScope } from "../utils/export";
import { createSafeName, hasUnsafeIdentifierName } from "../utils/safe-names";
import { getIdentifierSymbolId } from "../utils/symbols";
import { findFirstNodeAbove } from "../utils/typescript";

export function transformIdentifier(context: TransformationContext, identifier: ts.Identifier): lua.Identifier {
    if (isForRangeType(context, identifier)) {
        const callExpression = findFirstNodeAbove(identifier, ts.isCallExpression);
        if (!callExpression || !callExpression.parent || !ts.isForOfStatement(callExpression.parent)) {
            throw InvalidForRangeCall(
                identifier,
                "@forRange function can only be used as an iterable in a for...of loop."
            );
        }
    }

    const symbol = context.checker.getSymbolAtLocation(identifier);
    const name = symbol ? ts.unescapeLeadingUnderscores(symbol.escapedName) : identifier.text;
    const text = hasUnsafeIdentifierName(context, identifier) ? createSafeName(name) : name;

    const symbolId = getIdentifierSymbolId(context, identifier);
    return lua.createIdentifier(text, identifier, symbolId, name);
}

export const transformIdentifierExpression: FunctionVisitor<ts.Identifier> = (node, context) => {
    // TODO: Move below to avoid extra transforms?
    const identifier = transformIdentifier(context, node);

    const exportScope = getIdentifierExportScope(context, identifier);
    if (exportScope) {
        return createExportedIdentifier(context, identifier, exportScope);
    }

    if (node.originalKeywordKind === ts.SyntaxKind.UndefinedKeyword) {
        return lua.createNilLiteral();
    }

    const builtinResult = transformBuiltinIdentifierExpression(context, node);
    if (builtinResult) {
        return builtinResult;
    }

    return identifier;
};
