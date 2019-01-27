import ts = require("typescript");

export class Decorator {

    public static isValid(decoratorKindString: string): boolean {
        return this.getDecoratorKind(decoratorKindString) !== undefined;
    }

    public static fromJSDocTagInfo(tag: ts.JSDocTagInfo): Decorator | ActionDecorator | undefined {
        const decoratorName = this.getDecoratorKind(tag.name);
        switch (decoratorName) {
            case DecoratorKind.Action:
                const [eventType, eventNumber] = tag.text.split(" ").map(tagText => parseInt(tagText));
                return new ActionDecorator(eventType, eventNumber);
        }
        if (decoratorName) {
            return new Decorator(decoratorName, tag.text.split(" "));
        }
        return undefined;
    }

    public static getDecoratorKind(decoratorKindString: string): DecoratorKind {
        switch (decoratorKindString.toLowerCase()) {
            case "extension": return DecoratorKind.Extension;
            case "metaextension": return DecoratorKind.MetaExtension;
            case "customconstructor": return DecoratorKind.CustomConstructor;
            case "compilemembersonly": return DecoratorKind.CompileMembersOnly;
            case "pureabstract": return DecoratorKind.PureAbstract;
            case "phantom": return DecoratorKind.Phantom;
            case "tuplereturn": return DecoratorKind.TupleReturn;
            case "noclassor": return DecoratorKind.NoClassOr;
            case "luaiterator": return DecoratorKind.LuaIterator;
            case "object": return DecoratorKind.Object;
            case "room": return DecoratorKind.Room;
            case "action": return DecoratorKind.Action;
        }

        return undefined;
    }

    public kind: DecoratorKind;
    public args: string[];

    constructor(name: string, args: string[]) {
        this.kind = Decorator.getDecoratorKind(name);
        this.args = args;
    }
}

export class ActionDecorator {
    constructor(public eventType: number, public eventNumber: number) {}
}

export enum DecoratorKind {
    Extension = "Extension",
    MetaExtension = "MetaExtension",
    CustomConstructor = "CustomConstructor",
    CompileMembersOnly = "CompileMembersOnly",
    PureAbstract = "PureAbstract",
    Phantom = "Phantom",
    TupleReturn = "TupleReturn",
    NoClassOr = "NoClassOr",
    LuaIterator = "LuaIterator",
    Object = "Object",
    Room = "Room",
    Action = "Action",
}
