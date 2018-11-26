import { JSDocTagInfo } from "typescript";

export class Decorator {
    public static fromJSDocTag(tag: JSDocTagInfo): Decorator {
        const upName = tag.name.charAt(0).toUpperCase() + tag.name.slice(1);
        const kind = DecoratorKind[upName];
        return kind !== undefined ? new Decorator(kind, tag) : null;
    }

    public kind: DecoratorKind;
    public args: string[];

    private constructor(kind: DecoratorKind, tag: JSDocTagInfo) {
        this.kind = kind;
        this.args = [];
        const words = tag.text && tag.text.split(" ");
        if (words && words.length > 0) {
            this.args.push(...words);
        }
    }
}

export enum DecoratorKind {
    Extension,
    MetaExtension,
    CustomConstructor,
    CompileMembersOnly,
    PureAbstract,
    Phantom,
    TupleReturn,
    NoClassOr,
}
