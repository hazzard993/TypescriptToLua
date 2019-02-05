import * as path from "path";
import * as ts from "typescript";

import {CompilerOptions, LuaLibImportKind, LuaTarget} from "./CompilerOptions";
import {DecoratorKind} from "./Decorator";
import * as tstl from "./LuaAST";
import {LuaLib, LuaLibFeature} from "./LuaLib";
import {ContextType, TSHelper as tsHelper} from "./TSHelper";
import {TSTLErrors} from "./TSTLErrors";

export type StatementVisitResult = tstl.Statement | tstl.Statement[] | undefined;
export type ExpressionVisitResult = tstl.Expression | undefined;

export enum ScopeType {
    Function,
    Switch,
    Loop,
}

interface Scope {
    type: ScopeType;
    id: number;
}

export class LuaTransformer {
    public luaKeywords: Set<string> = new Set([
        "and", "break", "do",  "else", "elseif", "end",    "false",  "for",  "function", "if",
        "in",  "local", "nil", "not",  "or",     "repeat", "return", "then", "until",    "while",
    ]);

    private isStrict = true;

    private checker: ts.TypeChecker;
    protected options: CompilerOptions;
    private isModule: boolean;

    private currentSourceFile?: ts.SourceFile;

    private currentNamespace: ts.ModuleDeclaration;
    private classStack: tstl.Identifier[];

    private scopeStack: Scope[];
    private genVarCounter: number;

    private luaLibFeatureSet: Set<LuaLibFeature>;

    private readonly typeValidationCache: Map<ts.Type, Set<ts.Type>> = new Map<ts.Type, Set<ts.Type>>();

    public constructor(program: ts.Program, options: CompilerOptions) {
        this.checker = program.getTypeChecker();
        this.options = options;
        this.isStrict = this.options.alwaysStrict || (this.options.strict && this.options.alwaysStrict !== false) ||
                        (this.isModule && this.options.target && this.options.target >= ts.ScriptTarget.ES2015);

        if (!this.options.luaTarget) {
            this.options.luaTarget = LuaTarget.LuaJIT;
        }

        this.setupState();
    }

    public setupState(): void {
        this.scopeStack = [];
        this.genVarCounter = 0;
        this.currentSourceFile = undefined;
        this.isModule = false;
        this.scopeStack = [];
        this.classStack = [];
        this.luaLibFeatureSet = new Set<LuaLibFeature>();
    }

    // TODO make all other methods private???
    public transformSourceFile(node: ts.SourceFile): [tstl.Block, Set<LuaLibFeature>] {
        this.setupState();

        this.currentSourceFile = node;
        this.isModule = tsHelper.isFileModule(node);

        const statements = this.transformStatements(node.statements);
        if (this.isModule) {
            statements.unshift(
                tstl.createVariableDeclarationStatement(
                    tstl.createIdentifier("exports"),
                    tstl.createBinaryExpression(
                        tstl.createIdentifier("exports"),
                        tstl.createTableExpression(),
                        tstl.SyntaxKind.OrOperator
                    )));
            statements.push(
                tstl.createReturnStatement(
                    [tstl.createIdentifier("exports")]
                ));
        }

        return [tstl.createBlock(statements, node), this.luaLibFeatureSet];
    }

    public transformStatement(node: ts.Statement): StatementVisitResult {
        // Ignore declarations
        if (node.modifiers && node.modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)) {
            return undefined;
        }

        switch (node.kind) {
            // Block
            case ts.SyntaxKind.Block:
                return this.transformScopeBlock(node as ts.Block);
            // Declaration Statements
            case ts.SyntaxKind.ImportDeclaration:
                return this.transformImportDeclaration(node as ts.ImportDeclaration);
            case ts.SyntaxKind.ClassDeclaration:
                return this.transformClassDeclaration(node as ts.ClassDeclaration);
            case ts.SyntaxKind.ModuleDeclaration:
                return this.transformModuleDeclaration(node as ts.ModuleDeclaration);
            case ts.SyntaxKind.EnumDeclaration:
                return this.transformEnumDeclaration(node as ts.EnumDeclaration);
            case ts.SyntaxKind.FunctionDeclaration:
                return this.transformFunctionDeclaration(node as ts.FunctionDeclaration);
            case ts.SyntaxKind.TypeAliasDeclaration:
                return this.transformTypeAliasDeclaration(node as ts.TypeAliasDeclaration);
            case ts.SyntaxKind.InterfaceDeclaration:
                return this.transformInterfaceDeclaration(node as ts.InterfaceDeclaration);
            // Statements
            case ts.SyntaxKind.VariableStatement:
                return this.transformVariableStatement(node as ts.VariableStatement);
            case ts.SyntaxKind.ExpressionStatement:
                return this.transformExpressionStatement(node as ts.ExpressionStatement);
            case ts.SyntaxKind.ReturnStatement:
                return this.transformReturn(node as ts.ReturnStatement);
            case ts.SyntaxKind.IfStatement:
                return this.transformIfStatement(node as ts.IfStatement);
            case ts.SyntaxKind.WhileStatement:
                return this.transformWhileStatement(node as ts.WhileStatement);
            case ts.SyntaxKind.DoStatement:
                return this.transformDoStatement(node as ts.DoStatement);
            case ts.SyntaxKind.ForStatement:
                return this.transformForStatement(node as ts.ForStatement);
            case ts.SyntaxKind.ForOfStatement:
                return this.transformForOfStatement(node as ts.ForOfStatement);
            case ts.SyntaxKind.ForInStatement:
                return this.transformForInStatement(node as ts.ForInStatement);
            case ts.SyntaxKind.SwitchStatement:
                return this.transformSwitchStatement(node as ts.SwitchStatement);
            case ts.SyntaxKind.BreakStatement:
                return this.transformBreakStatement(node as ts.BreakStatement);
            case ts.SyntaxKind.TryStatement:
                return this.transformTryStatement(node as ts.TryStatement);
            case ts.SyntaxKind.ThrowStatement:
                return this.transformThrowStatement(node as ts.ThrowStatement);
            case ts.SyntaxKind.ContinueStatement:
                return this.transformContinueStatement(node as ts.ContinueStatement);
            case ts.SyntaxKind.EmptyStatement:
                return this.transformEmptyStatement(node as ts.EmptyStatement);
            case ts.SyntaxKind.NotEmittedStatement:
                return undefined;
            default:
                throw TSTLErrors.UnsupportedKind("Statement", node.kind, node);
        }
    }

    /** Converts an array of ts.Statements into an array of tstl.Statements */
    public transformStatements(statements: ts.Statement[] | ReadonlyArray<ts.Statement>): tstl.Statement[] {
        const tstlStatements: tstl.Statement[] = [];
        (statements as ts.Statement[]).forEach(statement => {
            tstlStatements.push(...this.statementVisitResultToStatementArray(this.transformStatement(statement)));
        });
        return tstlStatements;
    }

    public transformBlock(block: ts.Block): tstl.Block {
        return tstl.createBlock(this.transformStatements(block.statements), block);
    }

    public transformScopeBlock(block: ts.Block): tstl.DoStatement {
        return tstl.createDoStatement(this.transformStatements(block.statements), block);
    }

    public transformImportDeclaration(statement: ts.ImportDeclaration): StatementVisitResult {
        if (!statement.importClause || !statement.importClause.namedBindings) {
            throw TSTLErrors.DefaultImportsNotSupported(statement);
        }

        const imports = statement.importClause.namedBindings;

        const result: tstl.Statement[] = [];

        const moduleSpecifier = statement.moduleSpecifier as ts.StringLiteral;
        const importPath = moduleSpecifier.text.replace(new RegExp("\"", "g"), "");
        const resolvedModuleSpecifier = tstl.createStringLiteral(this.getImportPath(importPath));

        const requireCall = tstl.createCallExpression(tstl.createIdentifier("require"), [resolvedModuleSpecifier]);

        if (ts.isNamedImports(imports)) {
            const filteredElements = imports.elements.filter(e => {
                const decorators = tsHelper.getCustomDecorators(this.checker.getTypeAtLocation(e), this.checker);
                return !decorators.has(DecoratorKind.Extension) && !decorators.has(DecoratorKind.MetaExtension);
            });

            // Elide import if all imported types are extension classes
            if (filteredElements.length === 0) {
                return undefined;
            }

            const tstlIdentifier = (name: string) => "__TSTL_" + name;
            const importUniqueName = tstl.createIdentifier(tstlIdentifier(path.basename((importPath))));
            const requireStatement = tstl.createVariableDeclarationStatement(
                tstl.createIdentifier(tstlIdentifier(path.basename((importPath)))),
                requireCall,
                statement
            );
            result.push(requireStatement);

            filteredElements.forEach(importSpecifier => {
                if (importSpecifier.propertyName) {
                    const propertyIdentifier = this.transformIdentifier(importSpecifier.propertyName);
                    const propertyName = tstl.createStringLiteral(propertyIdentifier.text);
                    const renamedImport = tstl.createVariableDeclarationStatement(
                        this.transformIdentifier(importSpecifier.name),
                        tstl.createTableIndexExpression(importUniqueName, propertyName),
                        importSpecifier);
                    result.push(renamedImport);
                } else {
                    const nameIdentifier = this.transformIdentifier(importSpecifier.name);
                    const name = tstl.createStringLiteral(nameIdentifier.text);
                    const namedImport = tstl.createVariableDeclarationStatement(
                        nameIdentifier,
                        tstl.createTableIndexExpression(importUniqueName, name),
                        importSpecifier
                    );
                    result.push(namedImport);
                }
            });
            return result;
        } else if (ts.isNamespaceImport(imports)) {
            const requireStatement = tstl.createVariableDeclarationStatement(
                this.transformIdentifier(imports.name),
                requireCall,
                statement
            );
            result.push(requireStatement);
            return result;
        } else {
            throw TSTLErrors.UnsupportedImportType(imports);
        }
    }

    public transformClassDeclaration(
        statement: ts.ClassLikeDeclaration,
        nameOverride?: tstl.Identifier
    ): tstl.Statement[]
    {
        let className = statement.name ? this.transformIdentifier(statement.name) : nameOverride;
        if (!className) {
            throw TSTLErrors.MissingClassName(statement);
        }

        const decorators = tsHelper.getCustomDecorators(this.checker.getTypeAtLocation(statement), this.checker);

        // Find out if this class is extension of existing class
        const isExtension = decorators.has(DecoratorKind.Extension);

        const isMetaExtension = decorators.has(DecoratorKind.MetaExtension);

        if (isExtension && isMetaExtension) {
            throw TSTLErrors.InvalidExtensionMetaExtension(statement);
        }

        // Get type that is extended
        const extendsType = tsHelper.getExtendedType(statement, this.checker);

        // Get all properties with value
        const properties = statement.members.filter(ts.isPropertyDeclaration).filter(member => member.initializer);

        // Divide properties into static and non-static
        const isStatic = prop => prop.modifiers && prop.modifiers.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
        const staticFields = properties.filter(isStatic);
        const instanceFields = properties.filter(prop => !isStatic(prop));

        const result: tstl.Statement[] = [];

        // Overwrite the original className with the class we are overriding for extensions
        if (isMetaExtension) {
            if (!extendsType) {
                throw TSTLErrors.MissingMetaExtension(statement);
            }

            const extendsName = tstl.createStringLiteral(extendsType.symbol.escapedName as string);
            className = tstl.createIdentifier("__meta__" + extendsName.value);

            // local className = debug.getregistry()["extendsName"]
            const assignDebugCallIndex = tstl.createVariableDeclarationStatement(
                className,
                tstl.createTableIndexExpression(
                    tstl.createCallExpression(
                        tstl.createTableIndexExpression(
                            tstl.createIdentifier("debug"),
                            tstl.createStringLiteral("getregistry")
                        ),
                        []
                    ),
                    extendsName),
                statement);

            result.push(assignDebugCallIndex);
        }

        if (isExtension) {
            const extensionNameArg = decorators.get(DecoratorKind.Extension).args[0];
            if (extensionNameArg) {
                className = tstl.createIdentifier(extensionNameArg);
            } else if (extendsType) {
                className = tstl.createIdentifier(extendsType.symbol.escapedName as string);
            }
        }

        if (!isExtension && !isMetaExtension) {
            const classCreationMethods = this.createClassCreationMethods(
                statement,
                className,
                instanceFields,
                extendsType
            );
            result.push(...classCreationMethods);
        } else {
            for (const f of instanceFields) {
                const fieldName = this.transformPropertyName(f.name);

                const value = this.transformExpression(f.initializer);

                // className["fieldName"]
                const classField = tstl.createTableIndexExpression(
                    className,
                    fieldName);

                // className["fieldName"] = value;
                const assignClassField = tstl.createAssignmentStatement(classField, value);

                result.push(assignClassField);
            }
        }

        // Add static declarations
        for (const field of staticFields) {
            const fieldName = this.transformPropertyName(field.name);
            const value = this.transformExpression(field.initializer);

            const classField = tstl.createTableIndexExpression(
                    this.addExportToIdentifier(className),
                    fieldName
                );

            const fieldAssign = tstl.createAssignmentStatement(
                classField,
                value
            );

            result.push(fieldAssign);
        }

        // Find first constructor with body
        const constructor = statement.members
            .filter(n => ts.isConstructorDeclaration(n) && n.body)[0] as ts.ConstructorDeclaration;
        if (constructor) {
            // Add constructor plus initialization of instance fields
            result.push(this.transformConstructor(constructor, className, statement));
        } else if (!isExtension && !extendsType) {
            // Generate a constructor if none was defined
            result.push(this.transformConstructor(
                ts.createConstructor([], [], [], ts.createBlock([], true)),
                className,
                statement
            ));
        }

        // Transform get accessors
        statement.members.filter(ts.isGetAccessor).forEach(getAccessor => {
            result.push(this.transformGetAccessorDeclaration(getAccessor, className, statement));
        });

        // Transform set accessors
        statement.members.filter(ts.isSetAccessor).forEach(setAccessor => {
            result.push(this.transformSetAccessorDeclaration(setAccessor, className, statement));
        });

        // Transform methods
        statement.members.filter(ts.isMethodDeclaration).forEach(method => {
            result.push(this.transformMethodDeclaration(method, className));
        });

        return result;
    }

    public createClassCreationMethods(
        statement: ts.ClassLikeDeclarationBase,
        className: tstl.Identifier,
        instanceFields: ts.PropertyDeclaration[],
        extendsType: ts.Type): tstl.Statement[] {
        let noClassOr = false;
        if (extendsType) {
            const decorators = tsHelper.getCustomDecorators(extendsType, this.checker);
            noClassOr = decorators.has(DecoratorKind.NoClassOr);
        }

        const result: tstl.Statement[] = [];

        const classNameWithExport = this.addExportToIdentifier(className);

        // Write class declaration
        if (extendsType) {
            const extendedTypeNode = tsHelper.getExtendedTypeNode(statement, this.checker);
            const baseName = this.transformExpression(extendedTypeNode.expression);

            // baseName.new
            const newIndex = tstl.createTableIndexExpression(baseName, tstl.createStringLiteral("new"));

            // baseName.new()
            let rhs: tstl.Expression = tstl.createCallExpression(newIndex, []);

            if (!noClassOr) {
                // className or baseName.new()
                rhs = tstl.createBinaryExpression(classNameWithExport, rhs, tstl.SyntaxKind.OrOperator);
            }

            // (local) className = className or baseName.new()
            // (local) className = baseName.new()
            // exports.className = baseName.new()
            const classVar = this.createLocalOrExportedOrGlobalDeclaration(className, rhs, statement);

            result.push(...classVar);
        } else {
            // {}
            let rhs: tstl.Expression = tstl.createTableExpression();

            if (!noClassOr) {
                // className or {}
                rhs = tstl.createBinaryExpression(classNameWithExport, rhs, tstl.SyntaxKind.OrOperator);
            }

            // (local) className = className or {}
            // (local) className = {}
            // exports.className = {}
            const classVar = this.createLocalOrExportedOrGlobalDeclaration(className, rhs, statement);

            result.push(...classVar);
        }

        // className.__index
        const classIndex = tstl.createTableIndexExpression(classNameWithExport, tstl.createStringLiteral("__index"));
        // className.__index = className
        const assignClassIndex = tstl.createAssignmentStatement(classIndex, classNameWithExport, statement);

        result.push(assignClassIndex);

        if (extendsType) {
            const extendedTypeNode = tsHelper.getExtendedTypeNode(statement, this.checker);
            const baseName = this.transformExpression(extendedTypeNode.expression);

            // className.__base = baseName
            const classBase = tstl.createTableIndexExpression(classNameWithExport, tstl.createStringLiteral("__base"));

            const assignClassBase = tstl.createAssignmentStatement(classBase, baseName, statement);

            result.push(assignClassBase);
        }

        const newFuncStatements: tstl.Statement[] = [];

        // local self = setmetatable({}, className)
        const assignSelf = tstl.createVariableDeclarationStatement(
            this.createSelfIdentifier(),
            tstl.createCallExpression(
                tstl.createIdentifier("setmetatable"),
                [tstl.createTableExpression(), classNameWithExport]
            )
        );

        newFuncStatements.push(assignSelf);

        for (const f of instanceFields) {
            // Get identifier
            const fieldName = this.transformPropertyName(f.name);

            const value = this.transformExpression(f.initializer);

            // self[fieldName]
            const selfIndex = tstl.createTableIndexExpression(this.createSelfIdentifier(), fieldName);

            // self[fieldName] = value
            const assignClassField = tstl.createAssignmentStatement(selfIndex, value);

            newFuncStatements.push(assignClassField);
        }

        /*
        if construct and className.constructor then
            className.constructor(self, ...)
        end
        */
        const ifConstructor = tstl.createIfStatement(
            tstl.createBinaryExpression(
                tstl.createIdentifier("construct"),
                tstl.createTableIndexExpression(classNameWithExport, tstl.createStringLiteral("constructor")),
                tstl.SyntaxKind.AndOperator),
            tstl.createBlock([
                tstl.createExpressionStatement(tstl.createCallExpression(
                    tstl.createTableIndexExpression(classNameWithExport, tstl.createStringLiteral("constructor")),
                    [this.createSelfIdentifier(), tstl.createDotsLiteral()])),
            ]));

        newFuncStatements.push(ifConstructor);

        // return self
        const returnSelf = tstl.createReturnStatement([this.createSelfIdentifier()]);

        newFuncStatements.push(returnSelf);

        // function className.new(construct, ...) ... end
        // or function export.className.new(construct, ...) ... end
        const newFunc = tstl.createAssignmentStatement(
            tstl.createTableIndexExpression(
                classNameWithExport,
                tstl.createStringLiteral("new")),
            tstl.createFunctionExpression(
                tstl.createBlock(newFuncStatements),
                [tstl.createIdentifier("construct")],
                tstl.createDotsLiteral(),
                undefined,
                statement
            )
        );

        result.push(newFunc);

        return result;
    }

    public transformConstructor(
        statement: ts.ConstructorDeclaration,
        className: tstl.Identifier,
        classDeclaration: ts.ClassLikeDeclaration
    ): tstl.AssignmentStatement
    {
        // Don't transform methods without body (overload declarations)
        if (!statement.body) {
            return undefined;
        }

        // Check for field declarations in constructor
        const constructorFieldsDeclarations = statement.parameters.filter(p => p.modifiers !== undefined);

        // Transform constructor body
        this.classStack.push(className);

        const bodyStatements: tstl.Statement[] = [];

        // Add in instance field declarations
        for (const declaration of constructorFieldsDeclarations) {
            const declarationName = this.transformIdentifier(declaration.name as ts.Identifier);
            if (declaration.initializer) {
                // self.declarationName = declarationName or initializer
                const assignement = tstl.createAssignmentStatement(
                    tstl.createTableIndexExpression(
                        this.createSelfIdentifier(), tstl.createStringLiteral(declarationName.text)
                    ),
                    tstl.createBinaryExpression(
                        declarationName,
                        this.transformExpression(declaration.initializer), tstl.SyntaxKind.OrOperator
                    )
                );
                bodyStatements.push(assignement);
            } else {
                // self.declarationName = declarationName
                const assignement = tstl.createAssignmentStatement(
                    tstl.createTableIndexExpression(
                        this.createSelfIdentifier(),
                        tstl.createStringLiteral(declarationName.text)
                    ),
                    declarationName
                );
                bodyStatements.push(assignement);
            }
        }

        // function className.constructor(params) ... end

        const [params, dotsLiteral, restParamName] = this.transformParameters(
            statement.parameters,
            this.createSelfIdentifier()
        );

        bodyStatements.push(...this.transformFunctionBody(statement.parameters, statement.body, restParamName));

        const body: tstl.Block = tstl.createBlock(bodyStatements);


        const result = tstl.createAssignmentStatement(
            tstl.createTableIndexExpression(
                this.addExportToIdentifier(className),
                tstl.createStringLiteral("constructor")),
            tstl.createFunctionExpression(body, params, dotsLiteral, restParamName, undefined, undefined),
            statement);

        this.classStack.pop();

        return result;
    }

    public transformGetAccessorDeclaration(
        getAccessor: ts.GetAccessorDeclaration,
        className: tstl.Identifier,
        classDeclaration: ts.ClassLikeDeclaration
    ): tstl.AssignmentStatement
    {
        const name = this.transformIdentifier(getAccessor.name as ts.Identifier);

        const accessorFunction = tstl.createFunctionExpression(
            tstl.createBlock(this.transformFunctionBody(getAccessor.parameters, getAccessor.body)),
            [this.createSelfIdentifier()]
        );

        return tstl.createAssignmentStatement(
            tstl.createTableIndexExpression(
                this.addExportToIdentifier(className),
                tstl.createStringLiteral("get__" + name.text)),
            accessorFunction
        );
    }

    public transformSetAccessorDeclaration(
        setAccessor: ts.SetAccessorDeclaration,
        className: tstl.Identifier,
        classDeclaration: ts.ClassLikeDeclaration
    ): tstl.AssignmentStatement
    {
        const name = this.transformIdentifier(setAccessor.name as ts.Identifier);

        const [params, dot, restParam] = this.transformParameters(setAccessor.parameters, this.createSelfIdentifier());

        const accessorFunction = tstl.createFunctionExpression(
            tstl.createBlock(this.transformFunctionBody(setAccessor.parameters, setAccessor.body, restParam)),
            params,
            dot,
            restParam
        );

        return tstl.createAssignmentStatement(
            tstl.createTableIndexExpression(
                this.addExportToIdentifier(className),
                tstl.createStringLiteral("set__" + name.text)),
            accessorFunction
        );
    }

    public transformMethodDeclaration(
        node: ts.MethodDeclaration,
        className: tstl.Identifier
    ): tstl.AssignmentStatement
    {
        // Don't transform methods without body (overload declarations)
        if (!node.body) {
            return undefined;
        }

        let methodName = this.transformPropertyName(node.name);
        if (tstl.isStringLiteral(methodName) && methodName.value === "toString") {
            methodName = tstl.createStringLiteral("__tostring", node.name);
        }

        const type = this.checker.getTypeAtLocation(node);
        const context = tsHelper.getFunctionContextType(type, this.checker) !== ContextType.Void
            ? this.createSelfIdentifier()
            : undefined;
        const [paramNames, dots, restParamName] = this.transformParameters(node.parameters, context);

        const functionExpression = tstl.createFunctionExpression(
            tstl.createBlock(this.transformFunctionBody(node.parameters, node.body, restParamName)),
            paramNames,
            dots,
            restParamName
        );

        const parent = node.parent as ts.ClassLikeDeclaration;
        return tstl.createAssignmentStatement(
            tstl.createTableIndexExpression(
                this.addExportToIdentifier(className),
                methodName),
            functionExpression,
            node
        );
    }

    public transformParameters(parameters: ts.NodeArray<ts.ParameterDeclaration>, context?: tstl.Identifier):
        [tstl.Identifier[], tstl.DotsLiteral, tstl.Identifier | undefined] {
        // Build parameter string
        const paramNames: tstl.Identifier[] = [];
        if (context) {
            paramNames.push(context);
        }

        let restParamName: tstl.Identifier;
        let dotsLiteral: tstl.DotsLiteral;
        let identifierIndex = 0;

        // Only push parameter name to paramName array if it isn't a spread parameter
        for (const param of parameters) {
            if (ts.isIdentifier(param.name) && param.name.originalKeywordKind === ts.SyntaxKind.ThisKeyword) {
                continue;
            }

            // Binding patterns become ____TS_bindingPattern0, ____TS_bindingPattern1, etc as function parameters
            // See transformFunctionBody for how these values are destructured
            const paramName = ts.isObjectBindingPattern(param.name) || ts.isArrayBindingPattern(param.name)
                ? tstl.createIdentifier(`____TS_bindingPattern${identifierIndex++}`)
                : this.transformIdentifier(param.name as ts.Identifier);

            // This parameter is a spread parameter (...param)
            if (!param.dotDotDotToken) {
                paramNames.push(paramName);
            } else {
                restParamName = paramName;
                // Push the spread operator into the paramNames array
                dotsLiteral = tstl.createDotsLiteral();
            }
        }

        return [paramNames, dotsLiteral, restParamName];
    }

    public transformFunctionBody(
        parameters: ts.NodeArray<ts.ParameterDeclaration>,
        body: ts.Block,
        spreadIdentifier?: tstl.Identifier
    ): tstl.Statement[]
    {
        this.pushScope(ScopeType.Function);

        const headerStatements = [];

        // Add default parameters
        const defaultValueDeclarations = parameters
            .filter(declaration => declaration.initializer !== undefined)
            .map(declaration => this.transformParameterDefaultValueDeclaration(declaration));

        headerStatements.push(...defaultValueDeclarations);

        // Add object binding patterns
        let identifierIndex = 0;
        const bindingPatternDeclarations: tstl.Statement[] = [];
        parameters.forEach(binding => {
            if (ts.isObjectBindingPattern(binding.name) || ts.isArrayBindingPattern(binding.name)) {
                const identifier = tstl.createIdentifier(`____TS_bindingPattern${identifierIndex++}`);
                bindingPatternDeclarations.push(...this.transformBindingPattern(binding.name, identifier));
            }
        });

        headerStatements.push(...bindingPatternDeclarations);

        // Push spread operator here
        if (spreadIdentifier) {
            const spreadTable = this.wrapInTable(tstl.createDotsLiteral());
            headerStatements.push(tstl.createVariableDeclarationStatement(spreadIdentifier, spreadTable));
        }

        const bodyStatements = this.transformStatements(body.statements);

        this.popScope();

        return headerStatements.concat(bodyStatements);
    }

    public transformParameterDefaultValueDeclaration(declaration: ts.ParameterDeclaration): tstl.Statement {
        const parameterName = this.transformIdentifier(declaration.name as ts.Identifier);
        const parameterValue = this.transformExpression(declaration.initializer);
        const assignment = tstl.createAssignmentStatement(parameterName, parameterValue);

        const nilCondition = tstl.createBinaryExpression(
            parameterName,
            tstl.createNilLiteral(),
            tstl.SyntaxKind.EqualityOperator
        );

        const ifBlock = tstl.createBlock([assignment]);

        return tstl.createIfStatement(nilCondition, ifBlock, undefined, declaration);
    }

    public * transformBindingPattern(
        pattern: ts.BindingPattern,
        table: tstl.Identifier,
        propertyAccessStack: ts.PropertyName[] = []
    ): IterableIterator<tstl.Statement>
    {
        const isObjectBindingPattern = ts.isObjectBindingPattern(pattern);
        for (let index = 0; index < pattern.elements.length; index++) {
            const element = pattern.elements[index];
            if (ts.isBindingElement(element)) {
                if (ts.isArrayBindingPattern(element.name) || ts.isObjectBindingPattern(element.name)) {
                    // nested binding pattern
                    const propertyName = isObjectBindingPattern
                        ? element.propertyName
                        : ts.createNumericLiteral(String(index + 1));
                    propertyAccessStack.push(propertyName);
                    yield* this.transformBindingPattern(element.name, table, propertyAccessStack);
                } else {
                    // Disallow ellipsis destructure
                    if (element.dotDotDotToken) {
                        throw TSTLErrors.ForbiddenEllipsisDestruction(element);
                    }
                    // Build the path to the table
                    let tableExpression: tstl.Expression = table;
                    propertyAccessStack.forEach(property => {
                        const propertyName = ts.isPropertyName(property)
                            ? this.transformPropertyName(property)
                            : this.transformNumericLiteral(property);
                        tableExpression = tstl.createTableIndexExpression(tableExpression, propertyName);
                    });
                    // The identifier of the new variable
                    const variableName = this.transformIdentifier(element.name as ts.Identifier);
                    // The field to extract
                    const propertyName = this.transformIdentifier(
                        (element.propertyName || element.name) as ts.Identifier);
                    const expression = isObjectBindingPattern
                        ? tstl.createTableIndexExpression(tableExpression, tstl.createStringLiteral(propertyName.text))
                        : tstl.createTableIndexExpression(tableExpression, tstl.createNumericLiteral(index + 1));
                    if (element.initializer) {
                        const defaultExpression = tstl.createBinaryExpression(expression,
                            this.transformExpression(element.initializer), tstl.SyntaxKind.OrOperator);
                        yield* this.createLocalOrExportedOrGlobalDeclaration(variableName, defaultExpression);
                    } else {
                        yield* this.createLocalOrExportedOrGlobalDeclaration(variableName, expression);
                    }
                }
            }
        }
        propertyAccessStack.pop();
    }

    public transformModuleDeclaration(statement: ts.ModuleDeclaration): tstl.Statement[] {
        const decorators = tsHelper.getCustomDecorators(this.checker.getTypeAtLocation(statement), this.checker);
        // If phantom namespace elide the declaration and return the body
        if (decorators.has(DecoratorKind.Phantom) && statement.body && ts.isModuleBlock(statement.body)) {
            return this.transformStatements(statement.body.statements);
        }

        const result: tstl.Statement[] = [];

        if (this.currentNamespace) {
            // outerNS.innerNS = outerNS.innerNS or {}
            const namespaceDeclaration = tstl.createAssignmentStatement(
                tstl.createTableIndexExpression(
                    this.transformIdentifier(this.currentNamespace.name as ts.Identifier),
                    tstl.createStringLiteral(this.transformIdentifier(statement.name as ts.Identifier).text)),
                tstl.createBinaryExpression(
                    tstl.createTableIndexExpression(
                        this.transformIdentifier(this.currentNamespace.name as ts.Identifier),
                        tstl.createStringLiteral(this.transformIdentifier(statement.name as ts.Identifier).text)),
                    tstl.createTableExpression(),
                    tstl.SyntaxKind.OrOperator));

            result.push(namespaceDeclaration);

            // local innerNS = outerNS.innerNS
            const localDeclaration = tstl.createVariableDeclarationStatement(
                this.transformIdentifier(statement.name as ts.Identifier),
                tstl.createTableIndexExpression(
                    this.transformIdentifier(this.currentNamespace.name as ts.Identifier),
                    tstl.createStringLiteral(this.transformIdentifier(statement.name as ts.Identifier).text)));

            result.push(localDeclaration);
        } else if (this.isModule && (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export)) {
            // exports.NS = exports.NS or {}
            const namespaceDeclaration = tstl.createAssignmentStatement(
                this.createExportedIdentifier(this.transformIdentifier(statement.name as ts.Identifier)),
                tstl.createBinaryExpression(
                    this.createExportedIdentifier(this.transformIdentifier(statement.name as ts.Identifier)),
                    tstl.createTableExpression(),
                    tstl.SyntaxKind.OrOperator));

            result.push(namespaceDeclaration);

            // local NS = exports.NS
            const localDeclaration = tstl.createVariableDeclarationStatement(
                this.transformIdentifier(statement.name as ts.Identifier),
                this.createExportedIdentifier(this.transformIdentifier(statement.name as ts.Identifier)));

            result.push(localDeclaration);
        } else {
            // local NS = NS or {}
            const localDeclaration = this.createLocalOrExportedOrGlobalDeclaration(
                this.transformIdentifier(statement.name as ts.Identifier),
                tstl.createBinaryExpression(
                    this.transformIdentifier(statement.name as ts.Identifier),
                    tstl.createTableExpression(),
                    tstl.SyntaxKind.OrOperator
                )
            );

            result.push(...localDeclaration);
        }

        // Set current namespace for nested NS
        // Keep previous currentNS to reset after block transpilation
        const previousNamespace = this.currentNamespace;
        this.currentNamespace = statement;

        // Transform moduleblock to block and visit it
        if (statement.body && ts.isModuleBlock(statement.body)) {
            result.push(tstl.createDoStatement(this.transformStatements(statement.body.statements)));
        }

        this.currentNamespace = previousNamespace;

        return result;
    }

    public transformEnumDeclaration(enumDeclaration: ts.EnumDeclaration): StatementVisitResult {
        const type = this.checker.getTypeAtLocation(enumDeclaration);

        // Const enums should never appear in the resulting code
        if (type.symbol.getFlags() & ts.SymbolFlags.ConstEnum) {
            return undefined;
        }

        const membersOnly = tsHelper.getCustomDecorators(type, this.checker).has(DecoratorKind.CompileMembersOnly);

        const result: tstl.Statement[] = [];

        if (!membersOnly) {
            const name = this.transformIdentifier(enumDeclaration.name);
            const table = tstl.createTableExpression();
            result.push(...this.createLocalOrExportedOrGlobalDeclaration(name, table, enumDeclaration));
        }

        for (const enumMember of this.computeEnumMembers(enumDeclaration)) {
            const memberName = this.transformPropertyName(enumMember.name);
            if (membersOnly) {
                if (tstl.isIdentifier(memberName)) {
                    result.push(...this.createLocalOrExportedOrGlobalDeclaration(
                        memberName,
                        enumMember.value,
                        enumDeclaration
                    ));
                } else {
                    result.push(...this.createLocalOrExportedOrGlobalDeclaration(
                        tstl.createIdentifier(enumMember.name.getText(), enumMember.name),
                        enumMember.value,
                        enumDeclaration
                    ));
                }
            } else {
                const table: tstl.IdentifierOrTableIndexExpression  =
                    this.transformIdentifierExpression(enumDeclaration.name);
                const property = tstl.createTableIndexExpression(table, memberName, undefined);
                result.push(tstl.createAssignmentStatement(property, enumMember.value, enumMember.original));
            }
        }

        return result;
    }

    public computeEnumMembers(node: ts.EnumDeclaration):
        Array<{name: ts.PropertyName, value: tstl.NumericLiteral | tstl.StringLiteral, original: ts.Node}> {
        let numericValue = 0;
        let hasStringInitializers = false;

        return node.members.map(member => {
            let valueLiteral: tstl.NumericLiteral | tstl.StringLiteral;
            if (member.initializer) {
                if (ts.isNumericLiteral(member.initializer)) {
                    numericValue = Number(member.initializer.text);
                    valueLiteral = tstl.createNumericLiteral(numericValue);
                } else if (ts.isStringLiteral(member.initializer)) {
                    hasStringInitializers = true;
                    valueLiteral = tstl.createStringLiteral(member.initializer.text);
                } else {
                    throw TSTLErrors.InvalidEnumMember(member.initializer);
                }
            } else if (hasStringInitializers) {
                throw TSTLErrors.HeterogeneousEnum(node);
            } else {
                valueLiteral = tstl.createNumericLiteral(numericValue);
            }

            const enumMember = {
                name: member.name,
                original: member,
                value: valueLiteral,
            };

            numericValue++;

            return enumMember;
        });
    }

    public transformFunctionDeclaration(functionDeclaration: ts.FunctionDeclaration): StatementVisitResult {
        // Don't transform functions without body (overload declarations)
        if (!functionDeclaration.body) {
            return undefined;
        }

        const type = this.checker.getTypeAtLocation(functionDeclaration);
        const context = tsHelper.getFunctionContextType(type, this.checker) !== ContextType.Void
            ? this.createSelfIdentifier()
            : undefined;
        const [params, dotsLiteral, restParamName] = this.transformParameters(functionDeclaration.parameters, context);

        const name = this.transformIdentifier(functionDeclaration.name);
        const body = tstl.createBlock(
            this.transformFunctionBody(functionDeclaration.parameters, functionDeclaration.body, restParamName)
        );
        const functionExpression = tstl.createFunctionExpression(body, params, dotsLiteral, restParamName);

        return this.createLocalOrExportedOrGlobalDeclaration(name, functionExpression, functionDeclaration);
    }

    public transformTypeAliasDeclaration(statement: ts.TypeAliasDeclaration): undefined {
        return undefined;
    }

    public transformInterfaceDeclaration(statement: ts.InterfaceDeclaration): undefined {
        return undefined;
    }

    public transformVariableDeclaration(statement: ts.VariableDeclaration)
        : tstl.Statement[]
    {
        if (statement.initializer) {
            // Validate assignment
            const initializerType = this.checker.getTypeAtLocation(statement.initializer);
            const varType = this.checker.getTypeFromTypeNode(statement.type);
            this.validateFunctionAssignment(statement.initializer, initializerType, varType);
        }

        if (ts.isIdentifier(statement.name)) {
            // Find variable identifier
            const identifierName = this.transformIdentifier(statement.name);
            if (statement.initializer) {
                const value = this.transformExpression(statement.initializer);
                return this.createLocalOrExportedOrGlobalDeclaration(identifierName, value, statement);
            } else {
                return this.createLocalOrExportedOrGlobalDeclaration(
                    identifierName,
                    tstl.createNilLiteral(),
                    statement
                );
            }
        } else if (ts.isArrayBindingPattern(statement.name) || ts.isObjectBindingPattern(statement.name)) {
            // Destructuring types

            // For nested bindings and object bindings, fall back to transformBindingPattern
            if (ts.isObjectBindingPattern(statement.name)
                || statement.name.elements.some(elem => !ts.isBindingElement(elem) || !ts.isIdentifier(elem.name))) {
                const statements = [];
                let table: tstl.Identifier;
                if (ts.isIdentifier(statement.initializer)) {
                    table = this.transformIdentifier(statement.initializer);
                } else {
                    // Contain the expression in a temporary variable
                    table = tstl.createIdentifier("____");
                    statements.push(tstl.createVariableDeclarationStatement(
                        table, this.transformExpression(statement.initializer)));
                }
                statements.push(...this.transformBindingPattern(statement.name, table));
                return statements;
            }

            // Disallow ellipsis destruction
            if (statement.name.elements.some(elem => !ts.isBindingElement(elem) || elem.dotDotDotToken !== undefined)) {
                throw TSTLErrors.ForbiddenEllipsisDestruction(statement);
            }

            const vars = statement.name.elements.map(e => this.transformArrayBindingElement(e));

            // Don't unpack TupleReturn decorated functions
            if (statement.initializer) {
                if (tsHelper.isTupleReturnCall(statement.initializer, this.checker)) {
                    return this.createLocalOrExportedOrGlobalDeclaration(
                        vars,
                        this.transformExpression(statement.initializer),
                        statement
                    );
                } else {
                    // local vars = this.transpileDestructingAssignmentValue(node.initializer);
                    const initializer = this.createUnpackCall(
                        this.transformExpression(statement.initializer),
                        statement.initializer
                    );
                    return this.createLocalOrExportedOrGlobalDeclaration(vars, initializer, statement);
                }
            } else {
                return this.createLocalOrExportedOrGlobalDeclaration(
                    vars,
                    tstl.createNilLiteral(),
                    statement
                );
            }
        }
    }

    public transformVariableStatement(statement: ts.VariableStatement): tstl.Statement[] {
        const result: tstl.Statement[] = [];
        statement.declarationList.declarations
            .forEach(declaration => result.push(...this.transformVariableDeclaration(declaration)));
        return result;
    }

    public transformExpressionStatement(statement: ts.ExpressionStatement | ts.Expression): tstl.Statement {
        const expression = ts.isExpressionStatement(statement) ? statement.expression : statement;
        if (ts.isBinaryExpression(expression)) {
            const [isCompound, replacementOperator] = tsHelper.isBinaryAssignmentToken(expression.operatorToken.kind);
            if (isCompound) {
                // +=, -=, etc...
                return this.transformCompoundAssignmentStatement(
                    expression,
                    expression.left,
                    expression.right,
                    replacementOperator
                );

            } else if (expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                // = assignment
                return this.transformAssignmentStatement(expression);

            } else if (expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
                const lhs = this.transformExpressionStatement(expression.left);
                const rhs = this.transformExpressionStatement(expression.right);
                return tstl.createDoStatement([lhs, rhs], expression);
            }

        } else if (
            ts.isPrefixUnaryExpression(expression) &&
                (expression.operator === ts.SyntaxKind.PlusPlusToken
                || expression.operator === ts.SyntaxKind.MinusMinusToken)) {
            // ++i, --i
            const replacementOperator = expression.operator === ts.SyntaxKind.PlusPlusToken
                ? tstl.SyntaxKind.AdditionOperator
                : tstl.SyntaxKind.SubractionOperator;

            return this.transformCompoundAssignmentStatement(
                expression,
                expression.operand,
                ts.createLiteral(1),
                replacementOperator
            );
        }

        else if (ts.isPostfixUnaryExpression(expression)) {
            // i++, i--
            const replacementOperator = expression.operator === ts.SyntaxKind.PlusPlusToken
                ? tstl.SyntaxKind.AdditionOperator
                : tstl.SyntaxKind.SubractionOperator;

            return this.transformCompoundAssignmentStatement(
                expression,
                expression.operand,
                ts.createLiteral(1),
                replacementOperator
            );
        }

        else if (ts.isDeleteExpression(expression)) {
            return tstl.createAssignmentStatement(
                this.transformExpression(expression.expression) as tstl.IdentifierOrTableIndexExpression,
                tstl.createNilLiteral(),
                expression
            );
        }

        return tstl.createExpressionStatement(this.transformExpression(expression));
    }

    public transformReturn(statement: ts.ReturnStatement): tstl.Statement {
        if (statement.expression) {
            const returnType = tsHelper.getContainingFunctionReturnType(statement, this.checker);
            if (returnType) {
                const expressionType = this.checker.getTypeAtLocation(statement.expression);
                this.validateFunctionAssignment(statement, expressionType, returnType);
            }
            if (tsHelper.isInTupleReturnFunction(statement, this.checker)) {
                // Parent function is a TupleReturn function
                if (ts.isArrayLiteralExpression(statement.expression)) {
                    // If return expression is an array literal, leave out brackets.
                    return tstl.createReturnStatement(statement.expression.elements
                        .map(elem => this.transformExpression(elem)));
                } else if (!tsHelper.isTupleReturnCall(statement.expression, this.checker)) {
                    // If return expression is not another TupleReturn call, unpack it
                    const expression = this.createUnpackCall(
                        this.transformExpression(statement.expression),
                        statement.expression
                    );
                    return tstl.createReturnStatement([expression]);
                }
            }
            return tstl.createReturnStatement([this.transformExpression(statement.expression)]);
        } else {
            // Empty return
            return tstl.createReturnStatement();
        }
    }

    public transformIfStatement(statement: ts.IfStatement): tstl.IfStatement {
        const condition = this.transformExpression(statement.expression);
        const ifBlock = tstl.createBlock(this.transformBlockOrStatement(statement.thenStatement));
        if (statement.elseStatement) {
            if (ts.isIfStatement(statement.elseStatement)) {
                return tstl.createIfStatement(condition, ifBlock, this.transformIfStatement(statement.elseStatement));
            } else {
                const elseBlock = tstl.createBlock(this.transformBlockOrStatement(statement.elseStatement));
                return tstl.createIfStatement(condition, ifBlock, elseBlock);
            }
        }
        return tstl.createIfStatement(condition, ifBlock);
    }

    public transformWhileStatement(statement: ts.WhileStatement): tstl.WhileStatement {
        return tstl.createWhileStatement(
            tstl.createBlock(this.transformLoopBody(statement)),
            this.transformExpression(statement.expression),
            statement
        );
    }

    public transformDoStatement(statement: ts.DoStatement): tstl.RepeatStatement {
        return tstl.createRepeatStatement(
            tstl.createBlock(this.transformLoopBody(statement)),
            tstl.createUnaryExpression(this.transformExpression(statement.expression), tstl.SyntaxKind.NotOperator),
            statement
        );
    }

    public transformForStatement(statement: ts.ForStatement): tstl.Statement[] {
        const result: tstl.Statement[] = [];

        if (statement.initializer) {
            if (ts.isVariableDeclarationList(statement.initializer)) {
                for (const variableDeclaration of statement.initializer.declarations) {
                    // local initializer = value
                    result.push(...this.transformVariableDeclaration(variableDeclaration));
                }
            } else {
                result.push(this.transformExpressionStatement(statement.initializer));
            }
        }

        const condition = statement.condition
            ? this.transformExpression(statement.condition)
            : tstl.createBooleanLiteral(true);

        // Add body
        const body: tstl.Statement[] = this.transformLoopBody(statement);

        if (statement.incrementor) {
            body.push(this.transformExpressionStatement(statement.incrementor));
        }

        // while (condition) do ... end
        result.push(tstl.createWhileStatement(tstl.createBlock(body), condition));

        return result;
    }

    public transformForOfInitializer(initializer: ts.ForInitializer, expression: tstl.Expression): tstl.Statement {
        if (ts.isVariableDeclarationList(initializer)) {
            // Declaration of new variable
            const variableDeclarations = this.transformVariableDeclaration(initializer.declarations[0]);
            if (ts.isArrayBindingPattern(initializer.declarations[0].name)) {
                expression = this.createUnpackCall(expression, initializer);
            }
            // we can safely assume that for vars are not exported and therefore declarationstatenents
            return tstl.createVariableDeclarationStatement(
                (variableDeclarations[0] as tstl.VariableDeclarationStatement).left, expression);

        } else {
            // Assignment to existing variable
            let variables: tstl.IdentifierOrTableIndexExpression | tstl.IdentifierOrTableIndexExpression[];
            if (ts.isArrayLiteralExpression(initializer)) {
                expression = this.createUnpackCall(expression, initializer);
                variables = initializer.elements
                    .map(e => this.transformExpression(e)) as tstl.IdentifierOrTableIndexExpression[];
            } else {
                variables = this.transformExpression(initializer) as tstl.IdentifierOrTableIndexExpression;
            }
            return tstl.createAssignmentStatement(variables, expression);
        }
    }

    public transformLoopBody(
        loop: ts.WhileStatement | ts.DoStatement | ts.ForStatement | ts.ForOfStatement | ts.ForInOrOfStatement
    ): tstl.Statement[]
    {
        this.pushScope(ScopeType.Loop);
        const body = this.transformBlockOrStatement(loop.statement);
        const scopeId = this.popScope().id;

        if (this.options.luaTarget === LuaTarget.Lua51) {
            return body;
        }

        const baseResult: tstl.Statement[] = [tstl.createDoStatement(body)];
        const continueLabel = tstl.createLabelStatement(`__continue${scopeId}`);
        baseResult.push(continueLabel);

        return baseResult;
    }

    public transformBlockOrStatement(statement: ts.Statement): tstl.Statement[] {
        return ts.isBlock(statement)
            ? this.transformStatements(statement.statements)
            : this.statementVisitResultToStatementArray(this.transformStatement(statement));
    }

    public transformForOfArrayStatement(statement: ts.ForOfStatement, block: tstl.Block): StatementVisitResult {
        const arrayExpression = this.transformExpression(statement.expression);

        // Arrays use numeric for loop (performs better than ipairs)
        const indexVariable = tstl.createIdentifier("____TS_index");
        if (!ts.isIdentifier(statement.expression)) {
            // Cache iterable expression if it's not a simple identifier
            // local ____TS_array = ${iterable};
            // for ____TS_index = 1, #____TS_array do
            //     local ${initializer} = ____TS_array[____TS_index]
            const arrayVariable = tstl.createIdentifier("____TS_array");
            const arrayAccess = tstl.createTableIndexExpression(arrayVariable, indexVariable);
            const initializer = this.transformForOfInitializer(statement.initializer, arrayAccess);
            block.statements.splice(0, 0, initializer);
            return [
                tstl.createVariableDeclarationStatement(arrayVariable, arrayExpression),
                tstl.createForStatement(
                    block,
                    indexVariable,
                    tstl.createNumericLiteral(1),
                    tstl.createUnaryExpression(arrayVariable, tstl.SyntaxKind.LengthOperator)
                ),
            ];

        } else {
            // Simple identifier version
            // for ____TS_index = 1, #${iterable} do
            //     local ${initializer} = ${iterable}[____TS_index]
            const iterableAccess = tstl.createTableIndexExpression(arrayExpression, indexVariable);
            const initializer = this.transformForOfInitializer(statement.initializer, iterableAccess);
            block.statements.splice(0, 0, initializer);
            return tstl.createForStatement(
                block,
                indexVariable,
                tstl.createNumericLiteral(1),
                tstl.createUnaryExpression(arrayExpression, tstl.SyntaxKind.LengthOperator)
            );
        }
    }

    public transformForOfLuaIteratorStatement(statement: ts.ForOfStatement, block: tstl.Block): StatementVisitResult {
        const luaIterator = this.transformExpression(statement.expression);
        if (tsHelper.isTupleReturnCall(statement.expression, this.checker)) {
            // LuaIterator + TupleReturn
            if (ts.isVariableDeclarationList(statement.initializer)) {
                // Variables declared in for loop
                // for ${initializer} in ${iterable} do
                const initializerVariable = statement.initializer.declarations[0].name;
                if (ts.isArrayBindingPattern(initializerVariable)) {
                    return tstl.createForInStatement(
                        block,
                        initializerVariable.elements.map(e => this.transformArrayBindingElement(e)),
                        [luaIterator]
                    );

                } else {
                    // Single variable is not allowed
                    throw TSTLErrors.UnsupportedNonDestructuringLuaIterator(statement.initializer);
                }

            } else {
                // Variables NOT declared in for loop - catch iterator values in temps and assign
                // for ____TS_value0 in ${iterable} do
                //     ${initializer} = ____TS_value0
                if (ts.isArrayLiteralExpression(statement.initializer)) {
                    const tmps = statement.initializer.elements
                        .map((_, i) => tstl.createIdentifier(`____TS_value${i}`));
                    const assign = tstl.createAssignmentStatement(
                        statement.initializer.elements
                            .map(e => this.transformExpression(e)) as tstl.IdentifierOrTableIndexExpression[],
                        tmps
                    );
                    block.statements.splice(0, 0, assign);
                    return tstl.createForInStatement(block, tmps, [luaIterator]);

                } else {
                    // Single variable is not allowed
                    throw TSTLErrors.UnsupportedNonDestructuringLuaIterator(statement.initializer);
                }
            }

        } else {
            // LuaIterator (no TupleReturn)
            if (ts.isVariableDeclarationList(statement.initializer)
                && ts.isIdentifier(statement.initializer.declarations[0].name)) {
                // Single variable declared in for loop
                // for ${initializer} in ${iterator} do
                return tstl.createForInStatement(
                    block,
                    [this.transformIdentifier(statement.initializer.declarations[0].name as ts.Identifier)],
                    [luaIterator]
                );

            } else {
                // Destructuring or variable NOT declared in for loop
                // for ____TS_value in ${iterator} do
                //     local ${initializer} = unpack(____TS_value)
                const valueVariable = tstl.createIdentifier("____TS_value");
                const initializer = this.transformForOfInitializer(statement.initializer, valueVariable);
                block.statements.splice(0, 0, initializer);
                return tstl.createForInStatement(
                    block,
                    [valueVariable],
                    [luaIterator]
                );
            }
        }
    }

    public transformForOfIteratorStatement(statement: ts.ForOfStatement, block: tstl.Block): StatementVisitResult {
        const iterable = this.transformExpression(statement.expression);
        if (ts.isVariableDeclarationList(statement.initializer)
            && ts.isIdentifier(statement.initializer.declarations[0].name)) {
            // Single variable declared in for loop
            // for ${initializer} in __TS__iterator(${iterator}) do
            return tstl.createForInStatement(
                block,
                [this.transformIdentifier(statement.initializer.declarations[0].name as ts.Identifier)],
                [this.transformLuaLibFunction(LuaLibFeature.Iterator, iterable)]
            );

        } else {
            // Destructuring or variable NOT declared in for loop
            // for ____TS_value in __TS__iterator(${iterator}) do
            //     local ${initializer} = ____TS_value
            const valueVariable = tstl.createIdentifier("____TS_value");
            const initializer = this.transformForOfInitializer(statement.initializer, valueVariable);
            block.statements.splice(0, 0, initializer);
            return tstl.createForInStatement(
                block,
                [valueVariable],
                [this.transformLuaLibFunction(LuaLibFeature.Iterator, iterable)]
            );
        }
    }

    public transformForOfStatement(statement: ts.ForOfStatement): StatementVisitResult {
        // Transpile body
        const body = tstl.createBlock(this.transformLoopBody(statement));

        if (tsHelper.isArrayType(this.checker.getTypeAtLocation(statement.expression), this.checker)) {
            // Arrays
            return this.transformForOfArrayStatement(statement, body);

        } else if (tsHelper.isLuaIteratorCall(statement.expression, this.checker)) {
            // LuaIterators
            return this.transformForOfLuaIteratorStatement(statement, body);

        } else {
            // TS Iterables
            return this.transformForOfIteratorStatement(statement, body);
        }
    }

    public transformForInStatement(statement: ts.ForInStatement): StatementVisitResult {
        // Get variable identifier
        const variable = (statement.initializer as ts.VariableDeclarationList).declarations[0];
        const identifier = variable.name as ts.Identifier;

        // Transpile expression
        const pairsIdentifier = tstl.createIdentifier("pairs");
        const expression = tstl.createCallExpression(pairsIdentifier, [this.transformExpression(statement.expression)]);

        if (tsHelper.isArrayType(this.checker.getTypeAtLocation(statement.expression), this.checker)) {
            throw TSTLErrors.ForbiddenForIn(statement);
        }

        const body = tstl.createBlock(this.transformLoopBody(statement));

        return tstl.createForInStatement(
            body,
            [this.transformIdentifier(identifier)],
            [expression],
            statement
        );
    }

    public transformSwitchStatement(statement: ts.SwitchStatement): StatementVisitResult {
        if (this.options.luaTarget === LuaTarget.Lua51) {
            throw TSTLErrors.UnsupportedForTarget("Switch statements", this.options.luaTarget, statement);
        }

        this.pushScope(ScopeType.Switch);

        // Give the switch a unique name to prevent nested switches from acting up.
        const switchName = `____TS_switch${this.scopeStack.length}`;

        const expression = this.transformExpression(statement.expression);
        const switchVariable = tstl.createIdentifier(switchName);
        const switchVariableDeclaration = tstl.createVariableDeclarationStatement(switchVariable, expression);

        const statements: tstl.Statement[] = [switchVariableDeclaration];

        const caseClauses = statement.caseBlock.clauses.filter(c => ts.isCaseClause(c)) as ts.CaseClause[];

        for (let i = 0; i < caseClauses.length; i++) {
            const clause = caseClauses[i];
            // If the clause condition holds, go to the correct label
            const condition = tstl.createBinaryExpression(
                switchVariable,
                this.transformExpression(clause.expression),
                tstl.SyntaxKind.EqualityOperator
            );
            const goto = tstl.createGotoStatement(`${switchName}_case_${i}`);
            const conditionalGoto = tstl.createIfStatement(condition, tstl.createBlock([goto]));
            statements.push(conditionalGoto);
        }

        const hasDefaultCase = statement.caseBlock.clauses.some(c => ts.isDefaultClause(c));
        if (hasDefaultCase) {
            statements.push(tstl.createGotoStatement(`${switchName}_case_default`));
        } else {
            statements.push(tstl.createGotoStatement(`${switchName}_end`));
        }

        for (let i = 0; i < statement.caseBlock.clauses.length; i++) {
            const clause = statement.caseBlock.clauses[i];
            const label = ts.isCaseClause(clause)
                ? tstl.createLabelStatement(`${switchName}_case_${i}`)
                : tstl.createLabelStatement(`${switchName}_case_default`);

            const body = tstl.createDoStatement(this.transformStatements(clause.statements));
            statements.push(label, body);
        }

        statements.push(tstl.createLabelStatement(`${switchName}_end`));

        this.popScope();

        return statements;
    }

    public transformBreakStatement(breakStatement: ts.BreakStatement): StatementVisitResult {
        if (this.peekScope().type === ScopeType.Switch) {
            return tstl.createGotoStatement(`____TS_switch${this.scopeStack.length}_end`);
        } else {
            return tstl.createBreakStatement(breakStatement);
        }
    }

    public transformTryStatement(statement: ts.TryStatement): StatementVisitResult {
        const pCall = tstl.createIdentifier("pcall");
        const tryBlock = this.transformBlock(statement.tryBlock);
        const tryCall = tstl.createCallExpression(pCall, [tstl.createFunctionExpression(tryBlock)]);

        const result: tstl.Statement[] = [];

        if (statement.catchClause) {
            const tryResult = tstl.createIdentifier("____TS_try");

            const returnVariables = statement.catchClause && statement.catchClause.variableDeclaration
                ? [tryResult, this.transformIdentifier(statement.catchClause.variableDeclaration.name as ts.Identifier)]
                : [tryResult];

            const catchAssignment = tstl.createVariableDeclarationStatement(returnVariables, tryCall);

            result.push(catchAssignment);

            const notTryResult = tstl.createUnaryExpression(tryResult, tstl.SyntaxKind.NotOperator);
            result.push(tstl.createIfStatement(notTryResult, this.transformBlock(statement.catchClause.block)));

        } else {
            result.push(tstl.createExpressionStatement(tryCall));
        }

        if (statement.finallyBlock) {
            result.push(tstl.createDoStatement(this.transformBlock(statement.finallyBlock).statements));
        }

        return tstl.createDoStatement(
            result,
            statement
        );
    }

    public transformThrowStatement(statement: ts.ThrowStatement): StatementVisitResult {
        const type = this.checker.getTypeAtLocation(statement.expression);
        if (tsHelper.isStringType(type)) {
            const error = tstl.createIdentifier("error");
            return tstl.createExpressionStatement(
                tstl.createCallExpression(error, [this.transformExpression(statement.expression)]),
                statement
            );
        } else {
            throw TSTLErrors.InvalidThrowExpression(statement.expression);
        }
    }

    public transformContinueStatement(statement: ts.ContinueStatement): StatementVisitResult {
        if (this.options.luaTarget === LuaTarget.Lua51) {
            throw TSTLErrors.UnsupportedForTarget("Continue statement", this.options.luaTarget, statement);
        }

        return tstl.createGotoStatement(
            `__continue${this.peekScope().id}`,
            statement
        );
    }

    public transformEmptyStatement(arg0: ts.EmptyStatement): StatementVisitResult {
        return undefined;
    }

    // Expressions
    public transformExpression(expression: ts.Expression): ExpressionVisitResult {
        switch (expression.kind) {
            case ts.SyntaxKind.BinaryExpression:
                return this.transformBinaryExpression(expression as ts.BinaryExpression);
            case ts.SyntaxKind.ConditionalExpression:
                return this.transformConditionalExpression(expression as ts.ConditionalExpression);
            case ts.SyntaxKind.CallExpression:
                return this.transformCallExpression(expression as ts.CallExpression);
            case ts.SyntaxKind.PropertyAccessExpression:
                return this.transformPropertyAccessExpression(expression as ts.PropertyAccessExpression);
            case ts.SyntaxKind.ElementAccessExpression:
                return this.transformElementAccessExpression(expression as ts.ElementAccessExpression);
            case ts.SyntaxKind.Identifier:
                return this.transformIdentifierExpression(expression as ts.Identifier);
            case ts.SyntaxKind.StringLiteral:
            case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
                return this.transformStringLiteral(expression as ts.StringLiteral);
            case ts.SyntaxKind.TemplateExpression:
                return this.transformTemplateExpression(expression as ts.TemplateExpression);
            case ts.SyntaxKind.NumericLiteral:
                return this.transformNumericLiteral(expression as ts.NumericLiteral);
            case ts.SyntaxKind.TrueKeyword:
                return this.transformTrueKeyword(expression as ts.BooleanLiteral);
            case ts.SyntaxKind.FalseKeyword:
                return this.transformFalseKeyword(expression as ts.BooleanLiteral);
            case ts.SyntaxKind.NullKeyword:
            case ts.SyntaxKind.UndefinedKeyword:
                return this.transformNullOrUndefinedKeyword(expression);
            case ts.SyntaxKind.ThisKeyword:
                return this.transformThisKeyword(expression as ts.ThisExpression);
            case ts.SyntaxKind.PostfixUnaryExpression:
                return this.transformPostfixUnaryExpression(expression as ts.PostfixUnaryExpression);
            case ts.SyntaxKind.PrefixUnaryExpression:
                return this.transformPrefixUnaryExpression(expression as ts.PrefixUnaryExpression);
            case ts.SyntaxKind.ArrayLiteralExpression:
                return this.transformArrayLiteral(expression as ts.ArrayLiteralExpression);
            case ts.SyntaxKind.ObjectLiteralExpression:
                return this.transformObjectLiteral(expression as ts.ObjectLiteralExpression);
            case ts.SyntaxKind.DeleteExpression:
                return this.transformDeleteExpression(expression as ts.DeleteExpression);
            case ts.SyntaxKind.FunctionExpression:
                return this.transformFunctionExpression(expression as ts.ArrowFunction, this.createSelfIdentifier());
            case ts.SyntaxKind.ArrowFunction:
                return this.transformFunctionExpression(expression as ts.ArrowFunction, tstl.createIdentifier("____"));
            case ts.SyntaxKind.NewExpression:
                return this.transformNewExpression(expression as ts.NewExpression);
            case ts.SyntaxKind.ParenthesizedExpression:
                return this.transformParenthesizedExpression(expression as ts.ParenthesizedExpression);
            case ts.SyntaxKind.SuperKeyword:
                return this.transformSuperKeyword(expression as ts.SuperExpression);
            case ts.SyntaxKind.TypeAssertionExpression:
            case ts.SyntaxKind.AsExpression:
                return this.transformAssertionExpression(expression as ts.AssertionExpression);
            case ts.SyntaxKind.TypeOfExpression:
                return this.transformTypeOfExpression(expression as ts.TypeOfExpression);
            case ts.SyntaxKind.SpreadElement:
                return this.transformSpreadElement(expression as ts.SpreadElement);
            case ts.SyntaxKind.NonNullExpression:
                return this.transformExpression((expression as ts.NonNullExpression).expression);
            case ts.SyntaxKind.EmptyStatement:
                return undefined;
            case ts.SyntaxKind.NotEmittedStatement:
                return undefined;
            case ts.SyntaxKind.ClassExpression:
                const className = tstl.createIdentifier("____");
                const classDeclaration =  this.transformClassDeclaration(expression as ts.ClassExpression, className);
                return this.createImmediatelyInvokedFunctionExpression(classDeclaration, className, expression);
            case ts.SyntaxKind.PartiallyEmittedExpression:
                return this.transformExpression((expression as ts.PartiallyEmittedExpression).expression);
            default:
                throw TSTLErrors.UnsupportedKind("expression", expression.kind, expression);
        }
    }

    public transformBinaryOperation(
        node: ts.Node,
        left: tstl.Expression,
        right: tstl.Expression,
        operator: tstl.BinaryOperator
    ): tstl.Expression
    {
        switch (operator) {
            case tstl.SyntaxKind.BitwiseAndOperator:
            case tstl.SyntaxKind.BitwiseOrOperator:
            case tstl.SyntaxKind.BitwiseExclusiveOrOperator:
            case tstl.SyntaxKind.BitwiseLeftShiftOperator:
            case tstl.SyntaxKind.BitwiseRightShiftOperator:
            case tstl.SyntaxKind.BitwiseArithmeticRightShift:
                return this.transformBinaryBitOperation(node, left, right, operator);

            default:
                return tstl.createBinaryExpression(left, right, operator, node);
        }
    }

    public transformBinaryExpression(expression: ts.BinaryExpression): tstl.Expression {
        // Check if this is an assignment token, then handle accordingly

        const [isCompound, replacementOperator] = tsHelper.isBinaryAssignmentToken(expression.operatorToken.kind);
        if (isCompound) {
            return this.transformCompoundAssignmentExpression(
                expression,
                expression.left,
                expression.right,
                replacementOperator,
                false
            );
        }

        const lhs = this.transformExpression(expression.left);
        const rhs = this.transformExpression(expression.right);

        // Transpile operators
        switch (expression.operatorToken.kind) {
            case ts.SyntaxKind.AmpersandToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.BitwiseAndOperator);
            case ts.SyntaxKind.BarToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.BitwiseOrOperator);
            case ts.SyntaxKind.CaretToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.BitwiseExclusiveOrOperator);
            case ts.SyntaxKind.LessThanLessThanToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.BitwiseLeftShiftOperator);
            case ts.SyntaxKind.GreaterThanGreaterThanToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.BitwiseRightShiftOperator);
            case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.BitwiseArithmeticRightShift);
            case ts.SyntaxKind.AmpersandAmpersandToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.AndOperator);
            case ts.SyntaxKind.BarBarToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.OrOperator);
            case ts.SyntaxKind.PlusToken:
                // Replace string + with ..
                const typeLeft = this.checker.getTypeAtLocation(expression.left);
                const typeRight = this.checker.getTypeAtLocation(expression.right);
                if (tsHelper.isStringType(typeLeft) || tsHelper.isStringType(typeRight)) {
                    return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.ConcatOperator);
                }
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.AdditionOperator);
            case ts.SyntaxKind.MinusToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.SubractionOperator);
            case ts.SyntaxKind.AsteriskToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.MultiplicationOperator);
            case ts.SyntaxKind.AsteriskAsteriskToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.PowerOperator);
            case ts.SyntaxKind.SlashToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.DivisionOperator);
            case ts.SyntaxKind.PercentToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.ModuloOperator);
            case ts.SyntaxKind.GreaterThanToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.GreaterThanOperator);
            case ts.SyntaxKind.GreaterThanEqualsToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.GreaterEqualOperator);
            case ts.SyntaxKind.LessThanToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.LessThanOperator);
            case ts.SyntaxKind.LessThanEqualsToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.LessEqualOperator);
            case ts.SyntaxKind.EqualsToken:
                return this.transformAssignmentExpression(expression);
            case ts.SyntaxKind.EqualsEqualsToken:
            case ts.SyntaxKind.EqualsEqualsEqualsToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.EqualityOperator);
            case ts.SyntaxKind.ExclamationEqualsToken:
            case ts.SyntaxKind.ExclamationEqualsEqualsToken:
                return this.transformBinaryOperation(expression, lhs, rhs, tstl.SyntaxKind.InequalityOperator);
            case ts.SyntaxKind.InKeyword:
                const indexExpression = tstl.createTableIndexExpression(rhs, lhs);
                return tstl.createBinaryExpression(
                    indexExpression,
                    tstl.createNilLiteral(),
                    tstl.SyntaxKind.InequalityOperator,
                    expression
                );

            case ts.SyntaxKind.InstanceOfKeyword:
                return this.transformLuaLibFunction(LuaLibFeature.InstanceOf, lhs, rhs);

            case ts.SyntaxKind.CommaToken:
                return this.createImmediatelyInvokedFunctionExpression(
                    [this.transformExpressionStatement(expression.left)],
                    rhs,
                    expression
                );

            default:
                throw TSTLErrors.UnsupportedKind("binary operator", expression.operatorToken.kind, expression);
        }
    }

    public transformAssignment(lhs: ts.Expression, right: tstl.Expression): tstl.Statement {
        if (ts.isPropertyAccessExpression(lhs)) {
            const hasSetAccessor = tsHelper.hasSetAccessor(lhs, this.checker);
            if (hasSetAccessor) {
                return tstl.createExpressionStatement(this.transformSetAccessor(lhs, right), lhs.parent);
            } else if (hasSetAccessor === undefined) {
                // Undefined hasSetAccessor indicates a union with both set accessors and no accessors
                // on the same field.
                throw TSTLErrors.UnsupportedUnionAccessor(lhs);
            }
        }

        return tstl.createAssignmentStatement(
            this.transformExpression(lhs) as tstl.IdentifierOrTableIndexExpression,
            right,
            lhs.parent
        );
    }

    public transformAssignmentStatement(expression: ts.BinaryExpression): tstl.Statement {
        // Validate assignment
        const rightType = this.checker.getTypeAtLocation(expression.right);
        const leftType = this.checker.getTypeAtLocation(expression.left);
        this.validateFunctionAssignment(expression.right, rightType, leftType);

        if (ts.isArrayLiteralExpression(expression.left)) {
            // Destructuring assignment
            const left = expression.left.elements.map(e => this.transformExpression(e));
            let right: tstl.Expression[];
            if (ts.isArrayLiteralExpression(expression.right)) {
                right = expression.right.elements.map(e => this.transformExpression(e));
            } else if (tsHelper.isTupleReturnCall(expression.right, this.checker)) {
                right = [this.transformExpression(expression.right)];
            } else {
                right = [this.createUnpackCall(this.transformExpression(expression.right), expression.right)];
            }
            return tstl.createAssignmentStatement(
                left as tstl.IdentifierOrTableIndexExpression[],
                right,
                expression
            );
        } else {
            // Simple assignment
            return this.transformAssignment(expression.left, this.transformExpression(expression.right));
        }
    }

    public transformAssignmentExpression(expression: ts.BinaryExpression)
        : tstl.CallExpression | tstl.MethodCallExpression
    {
        // Validate assignment
        const rightType = this.checker.getTypeAtLocation(expression.right);
        const leftType = this.checker.getTypeAtLocation(expression.left);
        this.validateFunctionAssignment(expression.right, rightType, leftType);

        if (ts.isArrayLiteralExpression(expression.left)) {
            // Destructuring assignment
            // (function() local ${tmps} = ${right}; ${left} = ${tmps}; return {${tmps}} end)()
            const left = expression.left.elements.map(e => this.transformExpression(e));
            let right: tstl.Expression[];
            if (ts.isArrayLiteralExpression(expression.right)) {
                right = expression.right.elements.map(e => this.transformExpression(e));
            } else if (tsHelper.isTupleReturnCall(expression.right, this.checker)) {
                right = [this.transformExpression(expression.right)];
            } else {
                right = [this.createUnpackCall(this.transformExpression(expression.right), expression.right)];
            }
            const tmps = expression.left.elements.map((_, i) => tstl.createIdentifier(`____TS_tmp${i}`));
            const statements: tstl.Statement[] = [
                tstl.createVariableDeclarationStatement(tmps, right),
                tstl.createAssignmentStatement(left as tstl.IdentifierOrTableIndexExpression[], tmps),
            ];
            return this.createImmediatelyInvokedFunctionExpression(
                statements,
                tstl.createTableExpression(tmps.map(t => tstl.createTableFieldExpression(t))),
                expression
            );
        }

        if (
            (ts.isPropertyAccessExpression(expression.left) && !tsHelper.hasSetAccessor(expression.left, this.checker))
            || ts.isElementAccessExpression(expression.left)
        ) {
            // Left is property/element access: cache result while maintaining order of evaluation
            // (function(o, i, v) o[i] = v; return v end)(${objExpression}, ${indexExpression}, ${right})
            const objParameter = tstl.createIdentifier("o");
            const indexParameter = tstl.createIdentifier("i");
            const valueParameter = tstl.createIdentifier("v");
            const indexStatement = tstl.createTableIndexExpression(objParameter, indexParameter);
            const statements: tstl.Statement[] = [
                tstl.createAssignmentStatement(indexStatement, valueParameter),
                tstl.createReturnStatement([valueParameter]),
            ];
            const iife = tstl.createFunctionExpression(
                tstl.createBlock(statements),
                [objParameter, indexParameter, valueParameter]
            );
            const objExpression = this.transformExpression(expression.left.expression);
            let indexExpression: tstl.Expression;
            if (ts.isPropertyAccessExpression(expression.left)) {
                // Property access
                indexExpression = tstl.createStringLiteral(expression.left.name.text);
            } else {
                // Element access
                indexExpression = this.transformExpression(expression.left.argumentExpression);
                const argType = this.checker.getTypeAtLocation(expression.left.expression);
                if (tsHelper.isArrayType(argType, this.checker)) {
                    // Array access needs a +1
                    indexExpression = this.expressionPlusOne(indexExpression);
                }
            }
            const args = [objExpression, indexExpression, this.transformExpression(expression.right)];
            return tstl.createCallExpression(tstl.createParenthesizedExpression(iife), args);

        } else {
            // Simple assignment
            // (function() ${left} = ${right}; return ${left} end)()
            const left = this.transformExpression(expression.left);
            const right = this.transformExpression(expression.right);
            return this.createImmediatelyInvokedFunctionExpression(
                [this.transformAssignment(expression.left, right)],
                left,
                expression
            );
        }
    }

    public transformCompoundAssignmentExpression(
        expression: ts.Expression,
        lhs: ts.Expression,
        rhs: ts.Expression,
        replacementOperator: tstl.BinaryOperator,
        isPostfix: boolean
    ): tstl.CallExpression
    {
        if (replacementOperator === tstl.SyntaxKind.AdditionOperator) {
            // Check is we need to use string concat operator
            const typeLeft = this.checker.getTypeAtLocation(lhs);
            const typeRight = this.checker.getTypeAtLocation(rhs);
            if (tsHelper.isStringType(typeLeft) || tsHelper.isStringType(typeRight)) {
                replacementOperator = tstl.SyntaxKind.ConcatOperator;
            }
        }

        const left = this.transformExpression(lhs) as tstl.IdentifierOrTableIndexExpression;
        let right = this.transformExpression(rhs);

        const [hasEffects, objExpression, indexExpression] = tsHelper.isAccessExpressionWithEvaluationEffects(
            lhs,
            this.checker
        );
        if (hasEffects) {
            // Complex property/element accesses need to cache object/index expressions to avoid repeating side-effects
            // local __TS_obj, __TS_index = ${objExpression}, ${indexExpression};
            const obj = tstl.createIdentifier("____TS_obj");
            const index = tstl.createIdentifier("____TS_index");
            const objAndIndexDeclaration = tstl.createVariableDeclarationStatement(
                [obj, index], [this.transformExpression(objExpression), this.transformExpression(indexExpression)]);
            const accessExpression = tstl.createTableIndexExpression(obj, index);

            const tmp = tstl.createIdentifier("____TS_tmp");
            right = tstl.createParenthesizedExpression(right);
            let tmpDeclaration: tstl.VariableDeclarationStatement;
            let assignStatement: tstl.AssignmentStatement;
            if (isPostfix) {
                // local ____TS_tmp = ____TS_obj[____TS_index];
                // ____TS_obj[____TS_index] = ____TS_tmp ${replacementOperator} ${right};
                tmpDeclaration = tstl.createVariableDeclarationStatement(tmp, accessExpression);
                const operatorExpression = this.transformBinaryOperation(expression, tmp, right, replacementOperator);
                assignStatement = tstl.createAssignmentStatement(accessExpression, operatorExpression);
            } else {
                // local ____TS_tmp = ____TS_obj[____TS_index] ${replacementOperator} ${right};
                // ____TS_obj[____TS_index] = ____TS_tmp;
                const operatorExpression = this.transformBinaryOperation(
                    expression,
                    accessExpression,
                    right,
                    replacementOperator
                );
                tmpDeclaration = tstl.createVariableDeclarationStatement(tmp, operatorExpression);
                assignStatement = tstl.createAssignmentStatement(accessExpression, tmp);
            }
            // return ____TS_tmp
            return this.createImmediatelyInvokedFunctionExpression(
                [objAndIndexDeclaration, tmpDeclaration, assignStatement],
                tmp,
                lhs.parent
            );

        } else if (isPostfix) {
            // Postfix expressions need to cache original value in temp
            // local ____TS_tmp = ${left};
            // ${left} = ____TS_tmp ${replacementOperator} ${right};
            // return ____TS_tmp
            const tmpIdentifier = tstl.createIdentifier("____TS_tmp");
            const tmpDeclaration = tstl.createVariableDeclarationStatement(tmpIdentifier, left);
            const operatorExpression = this.transformBinaryOperation(
                expression,
                tmpIdentifier,
                right,
                replacementOperator
            );
            const assignStatement = this.transformAssignment(lhs, operatorExpression);
            return this.createImmediatelyInvokedFunctionExpression(
                [tmpDeclaration, assignStatement],
                tmpIdentifier,
                lhs.parent
            );

        } else if (ts.isPropertyAccessExpression(lhs) || ts.isElementAccessExpression(lhs)) {
            // Simple property/element access expressions need to cache in temp to avoid double-evaluation
            // local ____TS_tmp = ${left} ${replacementOperator} ${right};
            // ${left} = ____TS_tmp;
            // return ____TS_tmp
            const tmpIdentifier = tstl.createIdentifier("____TS_tmp");
            const operatorExpression = this.transformBinaryOperation(lhs.parent, left, right, replacementOperator);
            const tmpDeclaration = tstl.createVariableDeclarationStatement(tmpIdentifier, operatorExpression);
            const assignStatement = this.transformAssignment(lhs, tmpIdentifier);
            return this.createImmediatelyInvokedFunctionExpression(
                [tmpDeclaration, assignStatement],
                tmpIdentifier,
                lhs.parent
            );

        } else {
            // Simple expressions
            // ${left} = ${right}; return ${right}
            const operatorExpression = this.transformBinaryOperation(lhs.parent, left, right, replacementOperator);
            const assignStatement = this.transformAssignment(lhs, operatorExpression);
            return this.createImmediatelyInvokedFunctionExpression([assignStatement], left, lhs.parent);
        }
    }

    public transformCompoundAssignmentStatement(
        node: ts.Node,
        lhs: ts.Expression,
        rhs: ts.Expression,
        replacementOperator: tstl.BinaryOperator
    ): tstl.Statement
    {
        if (replacementOperator === tstl.SyntaxKind.AdditionOperator) {
            // Check is we need to use string concat operator
            const typeLeft = this.checker.getTypeAtLocation(lhs);
            const typeRight = this.checker.getTypeAtLocation(rhs);
            if (tsHelper.isStringType(typeLeft) || tsHelper.isStringType(typeRight)) {
                replacementOperator = tstl.SyntaxKind.ConcatOperator;
            }
        }

        const left = this.transformExpression(lhs) as tstl.IdentifierOrTableIndexExpression;
        const right = this.transformExpression(rhs);

        const [hasEffects, objExpression, indexExpression] = tsHelper.isAccessExpressionWithEvaluationEffects(
            lhs,
            this.checker
        );
        if (hasEffects) {
            // Complex property/element accesses need to cache object/index expressions to avoid repeating side-effects
            // local __TS_obj, __TS_index = ${objExpression}, ${indexExpression};
            // ____TS_obj[____TS_index] = ____TS_obj[____TS_index] ${replacementOperator} ${right};
            const obj = tstl.createIdentifier("____TS_obj");
            const index = tstl.createIdentifier("____TS_index");
            const objAndIndexDeclaration = tstl.createVariableDeclarationStatement(
                [obj, index], [this.transformExpression(objExpression), this.transformExpression(indexExpression)]);
            const accessExpression = tstl.createTableIndexExpression(obj, index);
            const operatorExpression = this.transformBinaryOperation(
                node,
                accessExpression,
                tstl.createParenthesizedExpression(right),
                replacementOperator
            );
            const assignStatement = tstl.createAssignmentStatement(accessExpression, operatorExpression);
            return tstl.createDoStatement([objAndIndexDeclaration, assignStatement]);

        } else {
            // Simple statements
            // ${left} = ${left} ${replacementOperator} ${right}
            const operatorExpression = this.transformBinaryOperation(node, left, right, replacementOperator);
            return this.transformAssignment(lhs, operatorExpression);
        }
    }

    public transformUnaryBitLibOperation(
        node: ts.Node,
        expression: tstl.Expression,
        operator: tstl.UnaryBitwiseOperator,
        lib: string
    ): ExpressionVisitResult
    {
        let bitFunction: string;
        switch (operator) {
            case tstl.SyntaxKind.BitwiseNotOperator:
                bitFunction = "bnot";
                break;
            default:
                throw TSTLErrors.UnsupportedKind("unary bitwise operator", operator, node);
        }
        return tstl.createCallExpression(
            tstl.createTableIndexExpression(tstl.createIdentifier(lib), tstl.createStringLiteral(bitFunction)),
            [expression],
            node
        );
    }

    public transformUnaryBitOperation(
        node: ts.Node,
        expression: tstl.Expression,
        operator: tstl.UnaryBitwiseOperator
    ): ExpressionVisitResult
    {
        switch (this.options.luaTarget) {
            case LuaTarget.Lua51:
                throw TSTLErrors.UnsupportedForTarget("Bitwise operations", this.options.luaTarget, node);

            case LuaTarget.Lua52:
                return this.transformUnaryBitLibOperation(node, expression, operator, "bit32");

            case LuaTarget.LuaJIT:
                return this.transformUnaryBitLibOperation(node, expression, operator, "bit");

            default:
                return tstl.createUnaryExpression(expression, operator, node);
        }
    }

    public transformBinaryBitLibOperation(
        node: ts.Node,
        left: tstl.Expression,
        right: tstl.Expression,
        operator: tstl.BinaryBitwiseOperator,
        lib: string
    ): ExpressionVisitResult
    {
        let bitFunction: string;
        switch (operator) {
            case tstl.SyntaxKind.BitwiseAndOperator:
                bitFunction = "band";
                break;
            case tstl.SyntaxKind.BitwiseOrOperator:
                bitFunction = "bor";
                break;
            case tstl.SyntaxKind.BitwiseExclusiveOrOperator:
                bitFunction = "bxor";
                break;
            case tstl.SyntaxKind.BitwiseLeftShiftOperator:
                bitFunction = "lshift";
                break;
            case tstl.SyntaxKind.BitwiseRightShiftOperator:
                bitFunction = "rshift";
                break;
            case tstl.SyntaxKind.BitwiseArithmeticRightShift:
                bitFunction = "arshift";
                break;
            default:
                throw TSTLErrors.UnsupportedKind("binary bitwise operator", operator, node);
        }
        return tstl.createCallExpression(
            tstl.createTableIndexExpression(tstl.createIdentifier(lib), tstl.createStringLiteral(bitFunction)),
            [left, right],
            node
        );
    }

    public transformBinaryBitOperation(
        node: ts.Node,
        left: tstl.Expression,
        right: tstl.Expression,
        operator: tstl.BinaryBitwiseOperator
    ): ExpressionVisitResult
    {
        switch (this.options.luaTarget) {
            case LuaTarget.Lua51:
                throw TSTLErrors.UnsupportedForTarget("Bitwise operations", this.options.luaTarget, node);

            case LuaTarget.Lua52:
                return this.transformBinaryBitLibOperation(node, left, right, operator, "bit32");

            case LuaTarget.LuaJIT:
                return this.transformBinaryBitLibOperation(node, left, right, operator, "bit");

            default:
                if (operator === tstl.SyntaxKind.BitwiseArithmeticRightShift) {
                    throw TSTLErrors.UnsupportedForTarget("Bitwise >>> operator", this.options.luaTarget, node);
                }
                return tstl.createBinaryExpression(left, right, operator, node);
        }
    }

    public transformProtectedConditionalExpression(expression: ts.ConditionalExpression): tstl.CallExpression {
        const condition = this.transformExpression(expression.condition);
        const val1 = this.transformExpression(expression.whenTrue);
        const val2 = this.transformExpression(expression.whenFalse);

        const val1Function = this.wrapInFunctionCall(val1);
        const val2Function = this.wrapInFunctionCall(val2);

        // ((condition and (() => v1)) or (() => v2))()
        const conditionAnd = tstl.createBinaryExpression(condition, val1Function, tstl.SyntaxKind.AndOperator);
        const orExpression = tstl.createBinaryExpression(conditionAnd, val2Function, tstl.SyntaxKind.OrOperator);
        return tstl.createCallExpression(orExpression, [], expression);
    }

    public transformConditionalExpression(expression: ts.ConditionalExpression): tstl.Expression {
        const isStrict = this.options.strict || this.options.strictNullChecks;
        if (tsHelper.isFalsible(this.checker.getTypeAtLocation(expression.whenTrue), isStrict)) {
          return this.transformProtectedConditionalExpression(expression);
        }
        const condition = this.transformExpression(expression.condition);
        const val1 = this.transformExpression(expression.whenTrue);
        const val2 = this.transformExpression(expression.whenFalse);

        // (condition and v1) or v2
        const conditionAnd = tstl.createBinaryExpression(condition, val1, tstl.SyntaxKind.AndOperator);
        return tstl.createBinaryExpression(
            conditionAnd,
            val2,
            tstl.SyntaxKind.OrOperator,
            expression
        );
    }

    public transformPostfixUnaryExpression(expression: ts.PostfixUnaryExpression): tstl.Expression {
        switch (expression.operator) {
            case ts.SyntaxKind.PlusPlusToken:
                return this.transformCompoundAssignmentExpression(
                    expression,
                    expression.operand,
                    ts.createLiteral(1),
                    tstl.SyntaxKind.AdditionOperator,
                    true
                );

            case ts.SyntaxKind.MinusMinusToken:
                return this.transformCompoundAssignmentExpression(
                    expression,
                    expression.operand,
                    ts.createLiteral(1),
                    tstl.SyntaxKind.SubractionOperator,
                    true
                );

            default:
                throw TSTLErrors.UnsupportedKind("unary postfix operator", expression.operator, expression);
        }
    }

    public transformPrefixUnaryExpression(expression: ts.PrefixUnaryExpression): tstl.Expression {
        switch (expression.operator) {
            case ts.SyntaxKind.PlusPlusToken:
                return this.transformCompoundAssignmentExpression(
                    expression,
                    expression.operand,
                    ts.createLiteral(1),
                    tstl.SyntaxKind.AdditionOperator,
                    false
                );

            case ts.SyntaxKind.MinusMinusToken:
                return this.transformCompoundAssignmentExpression(
                    expression,
                    expression.operand,
                    ts.createLiteral(1),
                    tstl.SyntaxKind.SubractionOperator,
                    false
                );

            case ts.SyntaxKind.PlusToken:
                return this.transformExpression(expression.operand);

            case ts.SyntaxKind.MinusToken:
                return tstl.createUnaryExpression(
                    this.transformExpression(expression.operand),
                    tstl.SyntaxKind.NegationOperator
                );

            case ts.SyntaxKind.ExclamationToken:
                return tstl.createUnaryExpression(
                    this.transformExpression(expression.operand),
                    tstl.SyntaxKind.NotOperator
                );

            case ts.SyntaxKind.TildeToken:
                return this.transformUnaryBitOperation(
                    expression,
                    this.transformExpression(expression.operand),
                    tstl.SyntaxKind.BitwiseNotOperator
                );

            default:
                throw TSTLErrors.UnsupportedKind("unary prefix operator", expression.operator, expression);
        }
    }

    public transformArrayLiteral(node: ts.ArrayLiteralExpression): tstl.TableExpression {
        const values: tstl.TableFieldExpression[] = [];

        node.elements.forEach(child => {
            values.push(tstl.createTableFieldExpression(this.transformExpression(child), undefined, child));
        });

        return tstl.createTableExpression(values, node);
    }

    public transformObjectLiteral(node: ts.ObjectLiteralExpression): tstl.TableExpression {
        const properties: tstl.TableFieldExpression[] = [];
        // Add all property assignments
        node.properties.forEach(element => {
            const name = this.transformPropertyName(element.name);
            if (ts.isPropertyAssignment(element)) {
                const expression = this.transformExpression(element.initializer);
                properties.push(tstl.createTableFieldExpression(expression, name, element));
            } else if (ts.isShorthandPropertyAssignment(element)) {
                const identifier = this.transformIdentifier(element.name);
                properties.push(tstl.createTableFieldExpression(identifier, name, element));
            } else if (ts.isMethodDeclaration(element)) {
                const expression = this.transformFunctionExpression(element, this.createSelfIdentifier());
                properties.push(tstl.createTableFieldExpression(expression, name, element));
            } else {
                throw TSTLErrors.UnsupportedKind("object literal element", element.kind, node);
            }
        });

        return tstl.createTableExpression(properties, node);
    }

    public transformDeleteExpression(expression: ts.DeleteExpression): tstl.CallExpression {
        const lhs = this.transformExpression(expression.expression) as tstl.IdentifierOrTableIndexExpression;
        const assignment = tstl.createAssignmentStatement(
            lhs,
            tstl.createNilLiteral(),
            expression
        );

        return this.createImmediatelyInvokedFunctionExpression(
            [assignment],
            [tstl.createBooleanLiteral(true)],
            expression
        );
    }

    public transformFunctionExpression(
        node: ts.FunctionLikeDeclaration,
        context: tstl.Identifier | undefined
    ): ExpressionVisitResult
    {
        const type = this.checker.getTypeAtLocation(node);
        const hasContext = tsHelper.getFunctionContextType(type, this.checker) !== ContextType.Void;
        // Build parameter string
        const [paramNames, dotsLiteral, spreadIdentifier] = this.transformParameters(
            node.parameters,
            hasContext ? context : undefined
        );

        const body = ts.isBlock(node.body) ? node.body : ts.createBlock([ts.createReturn(node.body)]);
        const transformedBody = this.transformFunctionBody(node.parameters, body, spreadIdentifier);

        return tstl.createFunctionExpression(
            tstl.createBlock(transformedBody),
            paramNames,
            dotsLiteral,
            spreadIdentifier,
            node
        );
    }

    public transformNewExpression(node: ts.NewExpression): tstl.CallExpression {
        const name = this.transformExpression(node.expression);
        const sig = this.checker.getResolvedSignature(node);
        const params = node.arguments
            ? this.transformArguments(node.arguments, sig, ts.createTrue())
            : [tstl.createBooleanLiteral(true)];

        const type = this.checker.getTypeAtLocation(node);
        const classDecorators = tsHelper.getCustomDecorators(type, this.checker);

        this.checkForLuaLibType(type);

        if (classDecorators.has(DecoratorKind.Extension) || classDecorators.has(DecoratorKind.MetaExtension)) {
            throw TSTLErrors.InvalidNewExpressionOnExtension(node);
        }

        if (classDecorators.has(DecoratorKind.CustomConstructor)) {
            const customDecorator = classDecorators.get(DecoratorKind.CustomConstructor);
            if (!customDecorator.args[0]) {
                throw TSTLErrors.InvalidDecoratorArgumentNumber("!CustomConstructor", 0, 1, node);
            }
            return tstl.createCallExpression(
                tstl.createIdentifier(customDecorator.args[0]),
                this.transformArguments(node.arguments),
                node
            );
        }

        return tstl.createCallExpression(
            tstl.createTableIndexExpression(name, tstl.createStringLiteral("new")),
            params,
            node
        );
    }

    public transformParenthesizedExpression(expression: ts.ParenthesizedExpression): tstl.Expression {
        return tstl.createParenthesizedExpression(
            this.transformExpression(expression.expression),
            expression
        );
    }

    public transformSuperKeyword(expression: ts.SuperExpression): tstl.Expression {
        return tstl.createTableIndexExpression(
            this.createSelfIdentifier(),
            tstl.createStringLiteral("__base"),
            expression
        );
    }

    public transformCallExpression(node: ts.CallExpression): tstl.Expression {
        // Check for calls on primitives to override
        let parameters: tstl.Expression[] = [];

        const isLuaIterator = tsHelper.isLuaIteratorCall(node, this.checker);
        const isTupleReturn = tsHelper.isTupleReturnCall(node, this.checker);
        const isTupleReturnForward =
            node.parent && ts.isReturnStatement(node.parent) && tsHelper.isInTupleReturnFunction(node, this.checker);
        const isInDestructingAssignment = tsHelper.isInDestructingAssignment(node);
        const returnValueIsUsed = node.parent && !ts.isExpressionStatement(node.parent);
        const wrapResult = isTupleReturn && !isTupleReturnForward&& !isInDestructingAssignment
            && returnValueIsUsed && !isLuaIterator;

        if (ts.isPropertyAccessExpression(node.expression)) {
            const result = this.transformPropertyCall(node);
            return wrapResult ? this.wrapInTable(result) : result;
        }

        if (ts.isElementAccessExpression(node.expression)) {
            const result = this.transformElementCall(node);
            return wrapResult ? this.wrapInTable(result) : result;
        }

        const signature = this.checker.getResolvedSignature(node);

        // Handle super calls properly
        if (node.expression.kind === ts.SyntaxKind.SuperKeyword) {
            parameters = this.transformArguments(node.arguments, signature, ts.createThis());
            const classIdentifier = this.classStack[this.classStack.length - 1];
            const baseIdentifier = tstl.createStringLiteral("__base");
            const constructorIdentifier = tstl.createStringLiteral("constructor");

            return tstl.createCallExpression(
                tstl.createTableIndexExpression(
                    tstl.createTableIndexExpression(this.addExportToIdentifier(classIdentifier), baseIdentifier),
                    constructorIdentifier
                ),
                parameters
            );
        }

        const callPath = this.transformExpression(node.expression);
        const signatureDeclaration = signature.getDeclaration();
        if (signatureDeclaration
            && !ts.isPropertyAccessExpression(node.expression)
            && tsHelper.getDeclarationContextType(signatureDeclaration, this.checker) === ContextType.NonVoid
            && !ts.isElementAccessExpression(node.expression))
        {
            const context = this.isStrict ? ts.createNull() : ts.createIdentifier("_G");
            parameters = this.transformArguments(node.arguments, signature, context);
        } else {
            parameters = this.transformArguments(node.arguments, signature);
        }

        const callExpression = tstl.createCallExpression(callPath, parameters);
        return wrapResult ? this.wrapInTable(callExpression) : callExpression;
    }

    public transformPropertyCall(node: ts.CallExpression): tstl.Expression {
        let parameters: tstl.Expression[] = [];

        // Check if call is actually on a property access expression
        if (!ts.isPropertyAccessExpression(node.expression)) {
            throw TSTLErrors.InvalidPropertyCall(node);
        }

        // If the function being called is of type owner.func, get the type of owner
        const ownerType = this.checker.getTypeAtLocation(node.expression.expression);

        if (ownerType.symbol && ownerType.symbol.escapedName === "Math") {
            parameters = this.transformArguments(node.arguments);
            return tstl.createCallExpression(
                this.transformMathExpression(node.expression.name),
                parameters,
                node
            );
        }

        if (ownerType.symbol && ownerType.symbol.escapedName === "StringConstructor") {
            parameters = this.transformArguments(node.arguments);
            return tstl.createCallExpression(
                this.transformStringExpression(node.expression.name),
                parameters,
                node
            );
        }

        switch (ownerType.flags) {
            case ts.TypeFlags.String:
            case ts.TypeFlags.StringLiteral:
                return this.transformStringCallExpression(node);
        }

        // if ownerType is a array, use only supported functions
        if (tsHelper.isExplicitArrayType(ownerType, this.checker)) {
            return this.transformArrayCallExpression(node);
        }

        // if ownerType inherits from an array, use array calls where appropriate
        if (tsHelper.isArrayType(ownerType, this.checker) &&
            tsHelper.isDefaultArrayCallMethodName(node.expression.name.escapedText as string)) {
            return this.transformArrayCallExpression(node);
        }

        if (tsHelper.isFunctionType(ownerType, this.checker)) {
            return this.transformFunctionCallExpression(node);
        }

        const signature = this.checker.getResolvedSignature(node);

        // Get the type of the function
        if (node.expression.expression.kind === ts.SyntaxKind.SuperKeyword) {
            // Super calls take the format of super.call(self,...)
            parameters = this.transformArguments(node.arguments, signature, ts.createThis());
            return tstl.createCallExpression(this.transformExpression(node.expression), parameters);
        } else {
            // Replace last . with : here
            const name = node.expression.name.escapedText;
            if (name === "toString") {
                const toStringIdentifier = tstl.createIdentifier("tostring");
                return tstl.createCallExpression(
                    toStringIdentifier, [this.transformExpression(node.expression.expression)], node);
            } else if (name === "hasOwnProperty") {
                const expr = this.transformExpression(node.expression.expression);
                parameters = this.transformArguments(node.arguments, signature);
                const rawGetIdentifier = tstl.createIdentifier("rawget");
                const rawGetCall = tstl.createCallExpression(rawGetIdentifier, [expr, ...parameters]);
                return tstl.createBinaryExpression(
                    rawGetCall, tstl.createNilLiteral(), tstl.SyntaxKind.InequalityOperator, node);
            } else {
                const parameters = this.transformArguments(node.arguments, signature);
                const table = this.transformExpression(node.expression.expression);
                const signatureDeclaration = signature.getDeclaration();
                if (!signatureDeclaration
                    || tsHelper.getDeclarationContextType(signatureDeclaration, this.checker) !== ContextType.Void)
                {
                    // table:name()
                    return tstl.createMethodCallExpression(
                        table,
                        tstl.createIdentifier(name),
                        parameters,
                        node
                    );
                } else {
                    // table.name()
                    const callPath = tstl.createTableIndexExpression(table, tstl.createStringLiteral(name));
                    return tstl.createCallExpression(callPath, parameters, node);
                }
            }
        }
    }

    public transformElementCall(node: ts.CallExpression): tstl.CallExpression {
        if (!ts.isElementAccessExpression(node.expression)) {
            throw TSTLErrors.InvalidElementCall(node);
        }

        const signature = this.checker.getResolvedSignature(node);
        let parameters = this.transformArguments(node.arguments, signature);

        const signatureDeclaration = signature.getDeclaration();
        if (!signatureDeclaration
            || tsHelper.getDeclarationContextType(signatureDeclaration, this.checker) !== ContextType.Void) {
            // Pass left-side as context

            const context = this.transformExpression(node.expression.expression);
            if (tsHelper.isExpressionWithEvaluationEffect(node.expression.expression)) {
                // Inject context parameter
                if (node.arguments.length > 0) {
                    parameters.unshift(tstl.createIdentifier("____TS_self"));
                } else {
                    parameters = [tstl.createIdentifier("____TS_self")];
                }

                // Cache left-side if it has effects
                //(function() local ____TS_self = context; return ____TS_self[argument](parameters); end)()
                const argument = this.transformExpression(node.expression.argumentExpression);
                const selfIdentifier = tstl.createIdentifier("____TS_self");
                const selfAssignment = tstl.createVariableDeclarationStatement(selfIdentifier, context);
                const index = tstl.createTableIndexExpression(selfIdentifier, argument);
                const callExpression = tstl.createCallExpression(index, parameters);
                return this.createImmediatelyInvokedFunctionExpression([selfAssignment], callExpression, node);
            } else {
                return tstl.createCallExpression(this.transformExpression(node.expression), [context, ...parameters]);
            }
        } else {
            // No context
            return tstl.createCallExpression(this.transformExpression(node.expression), parameters);
        }
    }

    public transformArguments<T extends ts.Expression>(
        params: ts.NodeArray<ts.Expression>,
        sig?: ts.Signature, context?: T
    ): tstl.Expression[]
    {
        const parameters: tstl.Expression[] = [];

        // Add context as first param if present
        if (context) {
            parameters.push(this.transformExpression(context));
        }

        if (sig && sig.parameters.length >= params.length) {
            for (let i = 0; i < params.length; ++i) {
                const param = params[i];
                const paramType = this.checker.getTypeAtLocation(param);
                const sigType = this.checker.getTypeAtLocation(sig.parameters[i].valueDeclaration);
                this.validateFunctionAssignment(param, paramType, sigType, sig.parameters[i].name);
                parameters.push(this.transformExpression(param));
            }
        } else {
            params.forEach(param => {
                parameters.push(this.transformExpression(param));
            });
        }

        return parameters;
    }

    public transformPropertyAccessExpression(node: ts.PropertyAccessExpression): tstl.Expression {
        const property = node.name.text;

        const hasGetAccessor = tsHelper.hasGetAccessor(node, this.checker);
        if (hasGetAccessor) {
            return this.transformGetAccessor(node);
        } else if (hasGetAccessor === undefined) {
            // Undefined hasGetAccessor indicates a union with both get accessors and no accessors on the same field.
            throw TSTLErrors.UnsupportedUnionAccessor(node);
        }

        // Check for primitive types to override
        const type = this.checker.getTypeAtLocation(node.expression);
        switch (type.flags) {
            case ts.TypeFlags.String:
            case ts.TypeFlags.StringLiteral:
                return this.transformStringProperty(node);
            case ts.TypeFlags.Object:
                if (tsHelper.isExplicitArrayType(type, this.checker))
                {
                    return this.transformArrayProperty(node);
                }
                else if (tsHelper.isArrayType(type, this.checker)
                    && tsHelper.isDefaultArrayPropertyName(node.name.escapedText as string))
                {
                    return this.transformArrayProperty(node);
                }
        }

        if (type.symbol && (type.symbol.flags & ts.SymbolFlags.ConstEnum)) {
            const propertyValueDeclaration = this.checker.getTypeAtLocation(node).symbol.valueDeclaration;

            if (propertyValueDeclaration && propertyValueDeclaration.kind === ts.SyntaxKind.EnumMember) {
                const enumMember = propertyValueDeclaration as ts.EnumMember;

                if (enumMember.initializer) {
                    return this.transformExpression(enumMember.initializer);
                } else {
                    const enumMembers = this.computeEnumMembers(enumMember.parent);
                    const memberPosition = enumMember.parent.members.indexOf(enumMember);

                    if (memberPosition === -1) {
                        throw TSTLErrors.UnsupportedProperty(type.symbol.name, property, node);
                    }

                    const value = tstl.cloneNode(enumMembers[memberPosition].value);
                    tstl.setNodeOriginal(value, enumMember);
                    return value;
                }
            }
        }

        this.checkForLuaLibType(type);

        const decorators = tsHelper.getCustomDecorators(type, this.checker);
        // Do not output path for member only enums
        if (decorators.has(DecoratorKind.CompileMembersOnly)) {
            return tstl.createIdentifier(property, node);
        }

        // Catch math expressions
        if (ts.isIdentifier(node.expression)) {
            if (node.expression.escapedText === "Math") {
                return this.transformMathExpression(node.name);
            } else if (node.expression.escapedText === "Symbol") {
                // Pull in Symbol lib
                this.importLuaLibFeature(LuaLibFeature.Symbol);
            }
        }

        const callPath = this.transformExpression(node.expression);
        return tstl.createTableIndexExpression(callPath, tstl.createStringLiteral(property), node);
    }

    public transformGetAccessor(node: ts.PropertyAccessExpression): tstl.MethodCallExpression {
        const name = tstl.createIdentifier(`get__${node.name.escapedText}`);
        const expression = this.transformExpression(node.expression);
        return tstl.createMethodCallExpression(expression, name, [], node);
    }

    public transformSetAccessor(node: ts.PropertyAccessExpression, value: tstl.Expression): tstl.MethodCallExpression {
        const name = tstl.createIdentifier(`set__${node.name.escapedText}`);
        const expression = this.transformExpression(node.expression);
        return tstl.createMethodCallExpression(expression, name, [value], node);
    }

    // Transpile a Math._ property
    public transformMathExpression(identifier: ts.Identifier): tstl.TableIndexExpression {
        const translation = {
            PI: "pi",
            abs: "abs",
            acos: "acos",
            asin: "asin",
            atan: "atan",
            ceil: "ceil",
            cos: "cos",
            exp: "exp",
            floor: "floor",
            log: "log",
            max: "max",
            min: "min",
            pow: "pow",
            random: "random",
            round: "round",
            sin: "sin",
            sqrt: "sqrt",
            tan: "tan",
        };

        if (translation[identifier.escapedText as string]) {
            const property = tstl.createStringLiteral(translation[identifier.escapedText as string]);
            const math = tstl.createIdentifier("math");
            return tstl.createTableIndexExpression(math, property, identifier);
        } else {
            throw TSTLErrors.UnsupportedProperty("math", identifier.escapedText as string, identifier);
        }
    }

    // Transpile access of string properties, only supported properties are allowed
    public transformStringProperty(node: ts.PropertyAccessExpression): tstl.UnaryExpression {
        switch (node.name.escapedText) {
            case "length":
                return tstl.createUnaryExpression(
                    this.transformExpression(node.expression), tstl.SyntaxKind.LengthOperator, node);
            default:
                throw TSTLErrors.UnsupportedProperty("string", node.name.escapedText as string, node);
        }
    }

    // Transpile access of array properties, only supported properties are allowed
    public transformArrayProperty(node: ts.PropertyAccessExpression): tstl.UnaryExpression {
        switch (node.name.escapedText) {
            case "length":
                return tstl.createUnaryExpression(
                    this.transformExpression(node.expression), tstl.SyntaxKind.LengthOperator, node);
            default:
                throw TSTLErrors.UnsupportedProperty("array", node.name.escapedText as string, node);
        }
    }

    public transformElementAccessExpression(node: ts.ElementAccessExpression): tstl.Expression {
        const table = this.transformExpression(node.expression);
        const index = this.transformExpression(node.argumentExpression);

        const type = this.checker.getTypeAtLocation(node.expression);
        if (tsHelper.isArrayType(type, this.checker)) {
            return tstl.createTableIndexExpression(table, this.expressionPlusOne(index), node);
        } else if (tsHelper.isStringType(type)) {
            return tstl.createCallExpression(
                tstl.createTableIndexExpression(tstl.createIdentifier("string"), tstl.createStringLiteral("sub")),
                [table, this.expressionPlusOne(index), this.expressionPlusOne(index)],
                node
            );
        } else {
            return tstl.createTableIndexExpression(table, index, node);
        }
    }

    public transformStringCallExpression(node: ts.CallExpression): tstl.Expression {
        const expression = node.expression as ts.PropertyAccessExpression;
        const params = this.transformArguments(node.arguments);
        const caller = this.transformExpression(expression.expression);

        const expressionName = expression.name.escapedText as string;
        switch (expressionName) {
            case "replace":
                return this.transformLuaLibFunction(LuaLibFeature.StringReplace, caller, ...params);
            case "concat":
                return this.transformLuaLibFunction(LuaLibFeature.StringConcat, caller, ...params);
            case "indexOf":
                const stringExpression =
                    node.arguments.length === 1
                        ? this.createStringCall("find", node, caller, params[0])
                        : this.createStringCall(
                              "find", node, caller, params[0],
                              this.expressionPlusOne(params[1]),
                              tstl.createBooleanLiteral(true)
                            );

                return tstl.createBinaryExpression(
                    tstl.createBinaryExpression(
                        stringExpression,
                        tstl.createNumericLiteral(0),
                        tstl.SyntaxKind.OrOperator
                    ),
                    tstl.createNumericLiteral(1),
                    tstl.SyntaxKind.SubractionOperator,
                    node
                );
            case "substr":
                if (node.arguments.length === 1) {
                    const arg1 = this.expressionPlusOne(this.transformExpression(node.arguments[0]));
                    return this.createStringCall("sub", node, caller, arg1);
                } else {
                    const arg1 = params[0];
                    const arg2 = params[1];
                    const sumArg = tstl.createBinaryExpression(arg1, arg2, tstl.SyntaxKind.AdditionOperator);
                    return this.createStringCall("sub", node, caller, this.expressionPlusOne(arg1), sumArg);
                }
            case "substring":
                if (node.arguments.length === 1) {
                    const arg1 = this.expressionPlusOne(params[0]);
                    return this.createStringCall("sub", node, caller, arg1);
                } else {
                    const arg1 = this.expressionPlusOne(params[0]);
                    const arg2 = params[1];
                    return this.createStringCall("sub", node, caller, arg1, arg2);
                }
            case "slice":
                if (node.arguments.length === 0) {
                    return caller;
                }
                else if (node.arguments.length === 1) {
                    const arg1 = this.expressionPlusOne(params[0]);
                    return this.createStringCall("sub", node, caller, arg1);
                } else {
                    const arg1 = this.expressionPlusOne(params[0]);
                    const arg2 = params[1];
                    return this.createStringCall("sub", node, caller, arg1, arg2);
                }
            case "toLowerCase":
                return this.createStringCall("lower", node, caller);
            case "toUpperCase":
                return this.createStringCall("upper", node, caller);
            case "split":
                return this.transformLuaLibFunction(LuaLibFeature.StringSplit, caller, ...params);
            case "charAt":
                const firstParamPlusOne = this.expressionPlusOne(params[0]);
                return this.createStringCall("sub", node, caller, firstParamPlusOne, firstParamPlusOne);
            case "charCodeAt":
            {
                const firstParamPlusOne = this.expressionPlusOne(params[0]);
                return this.createStringCall("byte", node, caller, firstParamPlusOne);
            }
            default:
                throw TSTLErrors.UnsupportedProperty("string", expressionName, node);
        }
    }

    public createStringCall(
        methodName: string,
        tsOriginal: ts.Node,
        ...params: tstl.Expression[]
    ): tstl.CallExpression
    {
        const stringIdentifier = tstl.createIdentifier("string");
        return tstl.createCallExpression(
            tstl.createTableIndexExpression(stringIdentifier, tstl.createStringLiteral(methodName)),
            params,
            tsOriginal
        );
    }

    // Transpile a String._ property
    public transformStringExpression(identifier: ts.Identifier): tstl.TableIndexExpression {
        const identifierString = identifier.escapedText as string;

        switch (identifierString) {
            case "fromCharCode":
                return tstl.createTableIndexExpression(
                    tstl.createIdentifier("string"),
                    tstl.createStringLiteral("char")
                );
            default:
                throw TSTLErrors.UnsupportedForTarget(
                    `string property ${identifierString}`,
                    this.options.luaTarget,
                    identifier
                );
        }
    }

    public transformArrayCallExpression(node: ts.CallExpression): tstl.CallExpression {
        const expression = node.expression as ts.PropertyAccessExpression;
        const params = this.transformArguments(node.arguments);
        const caller = this.transformExpression(expression.expression);
        const expressionName = expression.name.escapedText;
        switch (expressionName) {
            case "concat":
                return this.transformLuaLibFunction(LuaLibFeature.ArrayConcat, caller, ...params);
            case "push":
                return this.transformLuaLibFunction(LuaLibFeature.ArrayPush, caller, ...params);
            case "reverse":
                return this.transformLuaLibFunction(LuaLibFeature.ArrayReverse, caller);
            case "shift":
                return this.transformLuaLibFunction(LuaLibFeature.ArrayShift, caller);
            case "unshift":
                return this.transformLuaLibFunction(LuaLibFeature.ArrayUnshift, caller, ...params);
            case "sort":
                return this.transformLuaLibFunction(LuaLibFeature.ArraySort, caller);
            case "pop":
                return tstl.createCallExpression(
                    tstl.createTableIndexExpression(tstl.createIdentifier("table"), tstl.createStringLiteral("remove")),
                    [caller],
                    node
                );
            case "forEach":
                return this.transformLuaLibFunction(LuaLibFeature.ArrayForEach, caller, ...params);
            case "indexOf":
                return this.transformLuaLibFunction(LuaLibFeature.ArrayIndexOf, caller, ...params);
            case "map":
                return this.transformLuaLibFunction(LuaLibFeature.ArrayMap, caller, ...params);
            case "filter":
                return this.transformLuaLibFunction(LuaLibFeature.ArrayFilter, caller, ...params);
            case "some":
                return this.transformLuaLibFunction(LuaLibFeature.ArraySome, caller, ...params);
            case "every":
                return this.transformLuaLibFunction(LuaLibFeature.ArrayEvery, caller, ...params);
            case "slice":
                return this.transformLuaLibFunction(LuaLibFeature.ArraySlice, caller, ...params);
            case "splice":
                return this.transformLuaLibFunction(LuaLibFeature.ArraySplice, caller, ...params);
            case "join":
                const parameters = node.arguments.length === 0
                    ? [caller, tstl.createStringLiteral(",")]
                    : [caller].concat(params);

                return tstl.createCallExpression(
                    tstl.createTableIndexExpression(tstl.createIdentifier("table"), tstl.createStringLiteral("concat")),
                    parameters,
                    node
                );
            default:
                throw TSTLErrors.UnsupportedProperty("array", expressionName as string, node);
        }
    }

    public transformFunctionCallExpression(node: ts.CallExpression): tstl.CallExpression {
        const expression = node.expression as ts.PropertyAccessExpression;
        const callerType = this.checker.getTypeAtLocation(expression.expression);
        if (tsHelper.getFunctionContextType(callerType, this.checker) === ContextType.Void) {
            throw TSTLErrors.UnsupportedMethodConversion(node);
        }
        const params = this.transformArguments(node.arguments);
        const caller = this.transformExpression(expression.expression);
        const expressionName = expression.name.escapedText;
        switch (expressionName) {
            case "apply":
                return this.transformLuaLibFunction(LuaLibFeature.FunctionApply, caller, ...params);
            case "bind":
                return this.transformLuaLibFunction(LuaLibFeature.FunctionBind, caller, ...params);
            case "call":
                return this.transformLuaLibFunction(LuaLibFeature.FunctionCall, caller, ...params);
            default:
                throw TSTLErrors.UnsupportedProperty("function", expressionName as string, node);
        }
    }

    public transformArrayBindingElement(name: ts.ArrayBindingElement): tstl.Identifier {
        if (ts.isOmittedExpression(name)) {
            return tstl.createIdentifier("__", name);
        } else if (ts.isIdentifier(name)) {
            return this.transformIdentifier(name);
        } else if (ts.isBindingElement(name) && ts.isIdentifier(name.name)) {
            return this.transformIdentifier(name.name);
        } else {
            throw TSTLErrors.UnsupportedKind("array binding element", name.kind, name);
        }
    }

    public transformAssertionExpression(node: ts.AssertionExpression): tstl.Expression {
        this.validateFunctionAssignment(
            node,
            this.checker.getTypeAtLocation(node.expression),
            this.checker.getTypeAtLocation(node.type)
        );
        return this.transformExpression(node.expression);
    }

    public transformTypeOfExpression(node: ts.TypeOfExpression): ExpressionVisitResult {
        const expression = this.transformExpression(node.expression);
        const typeFunctionIdentifier = tstl.createIdentifier("type");
        const typeCall = tstl.createCallExpression(typeFunctionIdentifier, [expression]);
        const tableString = tstl.createStringLiteral("table");
        const objectString = tstl.createStringLiteral("object");
        const condition = tstl.createBinaryExpression(typeCall, tableString, tstl.SyntaxKind.EqualityOperator);
        const andClause = tstl.createBinaryExpression(condition, objectString, tstl.SyntaxKind.AndOperator);

        return tstl.createBinaryExpression(
            andClause,
            tstl.cloneNode(typeCall),
            tstl.SyntaxKind.OrOperator,
            node
        );
    }

    public transformSpreadElement(expression: ts.SpreadElement): ExpressionVisitResult {
        const innerExpression = this.transformExpression(expression.expression);

        return this.createUnpackCall(innerExpression, expression);
    }

    public transformStringLiteral(literal: ts.StringLiteralLike): tstl.StringLiteral {
        const text = tsHelper.escapeString(literal.text);
        return tstl.createStringLiteral(text);
    }

    public transformNumericLiteral(literal: ts.NumericLiteral): tstl.NumericLiteral {
        const value = Number(literal.text);
        return tstl.createNumericLiteral(value, literal);
    }

    public transformTrueKeyword(trueKeyword: ts.BooleanLiteral): tstl.BooleanLiteral {
        return tstl.createBooleanLiteral(true, trueKeyword);
    }

    public transformFalseKeyword(falseKeyword: ts.BooleanLiteral): tstl.BooleanLiteral {
        return tstl.createBooleanLiteral(false, falseKeyword);
    }

    public transformNullOrUndefinedKeyword(originalNode: ts.Node): tstl.NilLiteral {
        return tstl.createNilLiteral(originalNode);
    }

    public transformThisKeyword(thisKeyword: ts.ThisExpression): tstl.Expression {
        return this.createSelfIdentifier(thisKeyword);
    }

    public transformTemplateExpression(expression: ts.TemplateExpression): tstl.BinaryExpression {
        const parts: tstl.Expression[] = [tstl.createStringLiteral(tsHelper.escapeString(expression.head.text))];
        expression.templateSpans.forEach(span => {
            const expr = this.transformExpression(span.expression);
            const text = tstl.createStringLiteral(tsHelper.escapeString(span.literal.text));

            // tostring(expr).."text"
            parts.push(tstl.createBinaryExpression(
                tstl.createCallExpression(tstl.createIdentifier("tostring"), [expr]),
                text,
                tstl.SyntaxKind.ConcatOperator)
            );
        });
        return parts.reduce((prev, current) => tstl.createBinaryExpression(
            prev,
            current,
            tstl.SyntaxKind.ConcatOperator)
        ) as tstl.BinaryExpression;
    }

    public transformPropertyName(propertyName: ts.PropertyName): tstl.Expression {
        if (ts.isComputedPropertyName(propertyName)) {
            return this.transformExpression(propertyName.expression);
        } else if (ts.isStringLiteral(propertyName)) {
            return this.transformStringLiteral(propertyName);
        } else if (ts.isNumericLiteral(propertyName)) {
            const value = Number(propertyName.text);
            return tstl.createNumericLiteral(value, propertyName);
        } else {
            return tstl.createStringLiteral(this.transformIdentifier(propertyName).text);
        }
    }

    public transformIdentifier(expression: ts.Identifier): tstl.Identifier {
        if (expression.originalKeywordKind === ts.SyntaxKind.UndefinedKeyword) {
            return tstl.createIdentifier("nil");  // TODO this is a hack that allows use to keep Identifier
                                                  // as return time as changing that would break a lot of stuff.
                                                  // But this should be changed to retun tstl.createNilLiteral()
                                                  // at some point.
        }
        let escapedText = expression.escapedText as string;
        const underScoreCharCode = "_".charCodeAt(0);
        if (escapedText.length >= 3 && escapedText.charCodeAt(0) === underScoreCharCode &&
            escapedText.charCodeAt(1) === underScoreCharCode && escapedText.charCodeAt(2) === underScoreCharCode) {
            escapedText = escapedText.substr(1);
        }

        if (this.luaKeywords.has(escapedText)) {
            throw TSTLErrors.KeywordIdentifier(expression);
        }
        return tstl.createIdentifier(escapedText, expression);
    }

    public transformIdentifierExpression(expression: ts.Identifier): tstl.IdentifierOrTableIndexExpression {
        if (this.isIdentifierExported(expression.escapedText)) {
            return this.createExportedIdentifier(this.transformIdentifier(expression));
        }
        return this.transformIdentifier(expression);
    }

    public isIdentifierExported(identifierName: string | ts.__String): boolean {
        if (!this.isModule && !this.currentNamespace) {
            return false;
        }
        const currentScope = this.currentNamespace ? this.currentNamespace : this.currentSourceFile;
        const scopeSymbol = this.checker.getSymbolAtLocation(currentScope)
            ? this.checker.getSymbolAtLocation(currentScope)
            : this.checker.getTypeAtLocation(currentScope).getSymbol();
        return scopeSymbol.exports.has(identifierName as ts.__String);
    }

    public addExportToIdentifier(identifier: tstl.Identifier): tstl.IdentifierOrTableIndexExpression {
        if (this.isIdentifierExported(identifier.text)) {
            return this.createExportedIdentifier(identifier);
        }
        return identifier;
    }

    public createExportedIdentifier(identifier: tstl.Identifier): tstl.TableIndexExpression {
        const exportTable = this.currentNamespace
            ? this.transformIdentifier(this.currentNamespace.name as ts.Identifier)
            : tstl.createIdentifier("exports");

        return tstl.createTableIndexExpression(
            exportTable,
            tstl.createStringLiteral(identifier.text));
    }

    public transformLuaLibFunction(func: LuaLibFeature, ...params: tstl.Expression[]): tstl.CallExpression {
        this.importLuaLibFeature(func);
        const functionIdentifier = tstl.createIdentifier(`__TS__${func}`);
        return tstl.createCallExpression(functionIdentifier, params);
    }

    public checkForLuaLibType(type: ts.Type): void {
        if (type.symbol) {
            switch (this.checker.getFullyQualifiedName(type.symbol)) {
                case "Map":
                    this.importLuaLibFeature(LuaLibFeature.Map);
                    return;
                case "Set":
                    this.importLuaLibFeature(LuaLibFeature.Set);
                    return;
            }
        }
    }

    public importLuaLibFeature(feature: LuaLibFeature): void {
        // Add additional lib requirements
        if (feature === LuaLibFeature.Map || feature === LuaLibFeature.Set) {
            this.luaLibFeatureSet.add(LuaLibFeature.InstanceOf);
        }

        this.luaLibFeatureSet.add(feature);
    }

    public createImmediatelyInvokedFunctionExpression(
        statements: tstl.Statement[],
        result: tstl.Expression | tstl.Expression[],
        tsOriginal: ts.Node
    ): tstl.CallExpression
    {
        const body = statements ? statements.slice(0) : [];
        body.push(tstl.createReturnStatement(Array.isArray(result) ? result : [result]));
        const iife = tstl.createFunctionExpression(tstl.createBlock(body));
        return tstl.createCallExpression(tstl.createParenthesizedExpression(iife), [], tsOriginal);
    }

    public createUnpackCall(expression: tstl.Expression, tsOriginal: ts.Node): tstl.Expression {
        switch (this.options.luaTarget) {
            case LuaTarget.Lua51:
            case LuaTarget.LuaJIT:
                return tstl.createCallExpression(tstl.createIdentifier("unpack"), [expression], tsOriginal);

            case LuaTarget.Lua52:
            case LuaTarget.Lua53:
            default:
                return tstl.createCallExpression(
                    tstl.createTableIndexExpression(tstl.createIdentifier("table"), tstl.createStringLiteral("unpack")),
                    [expression],
                    tsOriginal
                );
        }
    }

    private getAbsoluteImportPath(relativePath: string): string {
        if (relativePath.charAt(0) !== "." && this.options.baseUrl) {
            return path.resolve(this.options.baseUrl, relativePath);
        }
        return path.resolve(path.dirname(this.currentSourceFile.fileName), relativePath);
    }

    private getImportPath(relativePath: string): string {
        // Calculate absolute path to import, ensure it uses forward slashes
        const absolutePathToImport = this.getAbsoluteImportPath(relativePath)
            .replace(/\\/g, "/");
        if (this.options.rootDir) {
            // Calculate path relative to project root
            // and replace path.sep with dots (lua doesn't know paths)
            const relativePathToRoot = this.pathToLuaRequirePath(
                absolutePathToImport.replace(this.options.rootDir, "").slice(1)
            );
            return relativePathToRoot;
        }

        return this.pathToLuaRequirePath(relativePath);
    }

    private pathToLuaRequirePath(filePath: string): string {
        return filePath.replace(new RegExp("\\\\|\/", "g"), ".");
    }

    private shouldExportIdentifier(identifier: tstl.Identifier | tstl.Identifier[]): boolean {
        if (!this.isModule && !this.currentNamespace) {
            return false;
        }
        if (Array.isArray(identifier)) {
            return identifier.some(i => this.isIdentifierExported(i.text));
        } else {
            return this.isIdentifierExported(identifier.text);
        }
    }

    private createSelfIdentifier(tsOriginal?: ts.Node): tstl.Identifier {
        return tstl.createIdentifier("self", tsOriginal);
    }

    private createLocalOrExportedOrGlobalDeclaration(
        lhs: tstl.Identifier | tstl.Identifier[],
        rhs: tstl.Expression,
        tsOriginal?: ts.Node,
        parent?: tstl.Node
    ): tstl.Statement[]
    {
        if (this.shouldExportIdentifier(lhs)) {
            // exported
            if (Array.isArray(lhs)) {
                return [tstl.createAssignmentStatement(
                    lhs.map(i => this.createExportedIdentifier(i)), rhs, undefined, parent
                )];
            } else {
                return [tstl.createAssignmentStatement(this.createExportedIdentifier(lhs), rhs, undefined, parent)];
            }
        }

        const insideFunction = this.scopeStack.some(s => s.type === ScopeType.Function);
        const isLetOrConst = tsOriginal && ts.isVariableDeclaration(tsOriginal)
            && tsOriginal.parent && (tsOriginal.parent.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0;
        if (this.isModule || this.currentNamespace || insideFunction || isLetOrConst) {
            // local
            const isFunction =
                tsOriginal
                && (ts.isFunctionDeclaration(tsOriginal)
                    || (ts.isVariableDeclaration(tsOriginal) && ts.isFunctionLike(tsOriginal.initializer)));
            if (isFunction) {
                // Separate declaration from assignment for functions to allow recursion
                return [
                    tstl.createVariableDeclarationStatement(lhs, undefined, tsOriginal, parent),
                    tstl.createAssignmentStatement(lhs, rhs, tsOriginal, parent),
                ];
            } else {
                return [tstl.createVariableDeclarationStatement(lhs, rhs, tsOriginal, parent)];
            }

        } else {
            // global
            return [tstl.createAssignmentStatement(lhs, rhs, tsOriginal, parent)];
        }
    }

    private validateFunctionAssignment(node: ts.Node, fromType: ts.Type, toType: ts.Type, toName?: string): void {
        if (toType === fromType) {
            return;
        }

        if ((toType.flags & ts.TypeFlags.Any) !== 0) {
            // Assigning to un-typed variable
            return;
        }

        // Use cache to avoid repeating check for same types (protects against infinite loop in recursive types)
        let fromTypeCache = this.typeValidationCache.get(fromType);
        if (fromTypeCache) {
            if (fromTypeCache.has(toType)) {
                return;
            }
        } else {
            fromTypeCache = new Set();
            this.typeValidationCache.set(fromType, fromTypeCache);
        }
        fromTypeCache.add(toType);

        // Check function assignments
        const fromContext = tsHelper.getFunctionContextType(fromType, this.checker);
        const toContext = tsHelper.getFunctionContextType(toType, this.checker);

        if (fromContext === ContextType.Mixed || toContext === ContextType.Mixed) {
            throw TSTLErrors.UnsupportedOverloadAssignment(node, toName);
        } else if (fromContext !== toContext && fromContext !== ContextType.None && toContext !== ContextType.None) {
            if (toContext === ContextType.Void) {
                throw TSTLErrors.UnsupportedFunctionConversion(node, toName);
            } else {
                throw TSTLErrors.UnsupportedMethodConversion(node, toName);
            }
        }

        const fromTypeNode = this.checker.typeToTypeNode(fromType);
        const toTypeNode = this.checker.typeToTypeNode(toType);

        if ((ts.isArrayTypeNode(toTypeNode) || ts.isTupleTypeNode(toTypeNode))
            && (ts.isArrayTypeNode(fromTypeNode) || ts.isTupleTypeNode(fromTypeNode))) {
            // Recurse into arrays/tuples
            const fromTypeReference = fromType as ts.TypeReference;
            const toTypeReference = toType as ts.TypeReference;
            const count = Math.min(fromTypeReference.typeArguments.length, toTypeReference.typeArguments.length);
            for (let i = 0; i < count; ++i) {
                this.validateFunctionAssignment(
                    node,
                    fromTypeReference.typeArguments[i],
                    toTypeReference.typeArguments[i],
                    toName
                );
            }
        }

        if ((toType.flags & ts.TypeFlags.Object) !== 0
            && ((toType as ts.ObjectType).objectFlags & ts.ObjectFlags.ClassOrInterface) !== 0
            && toType.symbol && toType.symbol.members && fromType.symbol && fromType.symbol.members)
        {
            // Recurse into interfaces
            toType.symbol.members.forEach((toMember, memberName) => {
                const fromMember = fromType.symbol.members.get(memberName);
                if (fromMember) {
                    const toMemberType = this.checker.getTypeOfSymbolAtLocation(toMember, node);
                    const fromMemberType = this.checker.getTypeOfSymbolAtLocation(fromMember, node);
                    this.validateFunctionAssignment(
                        node, fromMemberType, toMemberType, toName ? `${toName}.${memberName}` : memberName.toString());
                }
            });
        }
    }

    private wrapInFunctionCall(expression: tstl.Expression): tstl.FunctionExpression {
        const returnStatement = tstl.createReturnStatement([expression]);
        return tstl.createFunctionExpression(tstl.createBlock([returnStatement]));
    }

    private wrapInTable(...expressions: tstl.Expression[]): tstl.ParenthesizedExpression {
        const fields = expressions.map(e => tstl.createTableFieldExpression(e));
        return tstl.createParenthesizedExpression(tstl.createTableExpression(fields));
    }

    private expressionPlusOne(expression: tstl.Expression): tstl.BinaryExpression {
        return tstl.createBinaryExpression(expression, tstl.createNumericLiteral(1), tstl.SyntaxKind.AdditionOperator);
    }

    protected peekScope(): Scope {
        return this.scopeStack[this.scopeStack.length - 1];
    }

    protected pushScope(scopeType: ScopeType): void {
        this.scopeStack.push({type: scopeType, id: this.genVarCounter});
        this.genVarCounter++;
    }

    protected popScope(): Scope {
        return this.scopeStack.pop();
    }

    private statementVisitResultToStatementArray(visitResult: StatementVisitResult): tstl.Statement[] {
        if (!Array.isArray(visitResult)) {
            if (visitResult) {
                return [visitResult];
            }
            return [];
        }
        const flatten = (arr, result = []) => {
            for (let i = 0, length = arr.length; i < length; i++) {
                const value = arr[i];
                if (Array.isArray(value)) {
                    flatten(value, result);
                } else if (value) {
                    // ignore value if undefined
                    result.push(value);
                }
            }
            return result;
        };
        return flatten(visitResult);
    }
}
