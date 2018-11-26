import { JSDocTagInfo } from "typescript";

export class Pragma {
    public static fromJSDocTag(tag: JSDocTagInfo): Pragma {
        const upName = tag.name.charAt(0).toUpperCase() + tag.name.slice(1);
        const kind = PragmaKind[upName];
        return kind !== undefined ? new Pragma(kind, tag) : null;
    }

    public kind: PragmaKind;
    public args: string[];

    private constructor(kind: PragmaKind, tag: JSDocTagInfo) {
        this.kind = kind;
        this.args = [];
        const words = tag.text && tag.text.split(" ");
        if (words && words.length > 0) {
            this.args.push(...words);
        }
    }
}

export enum PragmaKind {
    Extension,
    MetaExtension,
    CustomConstructor,
    CompileMembersOnly,
    PureAbstract,
    Phantom,
    TupleReturn,
    NoClassOr,
}
