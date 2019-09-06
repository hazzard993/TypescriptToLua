import * as ts from "typescript";

export function declarationTransformerFactory<T extends ts.Node>(context: ts.TransformationContext): ts.Transformer<T> {
    return function transform(sourceFile: T): T {
        if (ts.isSourceFile(sourceFile)) {
            const statement = ts.createEmptyStatement();
            ts.updateSourceFileNode(sourceFile, [
                statement,
                ...sourceFile.statements
            ]);
        }
        function visit(node: ts.Node): ts.Node | undefined {
            if (ts.isSourceFile(node)) {
                const statement = ts.createEmptyStatement();
                ts.addSyntheticLeadingComment(statement, ts.SyntaxKind.MultiLineCommentTrivia, " @noSelfInFile ", true);
                return ts.updateSourceFileNode(node, [
                    statement,
                    ...node.statements
                ]);
            }
        }
        // return sourceFile;
        // const noSelfAdded = false;
        // function visit(node: ts.Node): ts.Node {
            // ts.updateSourceFileNode()
            // if (!noSelfAdded) {
                // const statement = ts.createEmptyStatement();
                // ts.addSyntheticTrailingComment(statement, ts.SyntaxKind.MultiLineCommentTrivia, " @noSelfInFile ", true);
                // return statement;
            // }
            // if (!ts.isFunctionDeclaration(node)) {
            //     // const x: ts.SourceFile
            //     const comment = ts.addSyntheticTrailingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, " @noSelfInFile ", true);
            //     ts.moveSyntheticComments(sourceFile, comment);
            //     console.log(node);
            // }
            // if (ts.isFunctionDeclaration(node)) {
                // console.log(ts.getCommentRange(node));
                // const comments = ts.getSyntheticLeadingComments(node);
                // if (comments) {
                //     console.log(comments.map(comment => comment.text).join("\n"));
                // }
                // console.log(ts.getSyntheticLeadingComments(node));
                // ts.setSyn
                // ts.addSyntheticLeadingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, " @noSelfInFile ", true);
            // }
            // return ts.visitEachChild(node, visit, context);
        // }
        return ts.visitNode(sourceFile, visit);
    };
}
