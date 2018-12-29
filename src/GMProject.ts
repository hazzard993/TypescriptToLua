interface ScriptsFolder {
    $: {
        name: string,
    };
    scripts?: ScriptsFolder[];
    script?: string[];
}

interface SoundsFolder {
    $: {
        name: string,
    };
    sounds?: SoundsFolder[];
    sound?: string[];
}

interface SpritesFolder {
    $: {
        name: string,
    };
    sprites?: SpritesFolder[];
    sprite?: string[];
}

interface BackgroundsFolder {
    $: {
        name: string,
    };
    backgrounds?: BackgroundsFolder[];
    background?: string[];
}

interface PathsFolder {
    $: {
        name: string,
    };
    paths?: PathsFolder[];
    path?: string[];
}

interface ObjectsFolder {
    $: {
        name: string,
    };
    objects?: ObjectsFolder[];
    object?: string[];
}

interface RoomsFolder {
    $: {
        name: string,
    };
    rooms?: RoomsFolder[];
    room?: string[];
}

/**
 * JSON structure for a .project.gmx file.
 * Can be converted to acceptable project XML via xml2js for Game Maker.
 */
export interface Project {
    assets: {
        Configs: [
            {
                $: {
                    name: "configs",
                },
                Config: string[],
            }
        ],
        NewExtensions: [
            {
                NewExtension: string[],
            }
        ],
        sounds: SoundsFolder[],
        sprites: SpritesFolder[],
        backgrounds: BackgroundsFolder[],
        paths: PathsFolder[],
        scripts: ScriptsFolder[],
        objects: ObjectsFolder[],
        rooms: RoomsFolder[],
        help: [
                {
                rtf: "help.rtf",
            }
        ],
        TutorialState: [
            {
                IsTutorial: 0,
                TutorialName: "",
                TutorialPage: 0,
            }
        ],
    };
}

/**
 * Returns a new JSON object for a new project
 */
export function newProject(): Project {
    // tslint:disable:object-literal-sort-keys
    return {
        assets: {
            Configs: [
                {
                    $: {
                        name: "configs",
                    },
                    Config: ["Configs\\Default"],
                },
            ],
            NewExtensions: [
                {
                    NewExtension: [],
                },
            ],
            sounds: [
                {
                    $: {
                        name: "sound",
                    },
                },
            ],
            sprites: [
                {
                    $: {
                        name: "sprites",
                    },
                },
            ],
            backgrounds: [
                {
                    $: {
                        name: "backgrounds",
                    },
                },
            ],
            paths: [
                {
                    $: {
                        name: "paths",
                    },
                },
            ],
            scripts: [
                {
                    $: {
                        name: "scripts",
                    },
                },
            ],
            objects: [
                {
                    $: {
                        name: "objects",
                    },
                },
            ],
            rooms: [
                {
                    $: {
                        name: "rooms",
                    },
                },
            ],
            help: [
                {
                    rtf: "help.rtf",
                },
            ],
            TutorialState: [
                {
                    IsTutorial: 0,
                    TutorialName: "",
                    TutorialPage: 0,
                },
            ],
        },
    } as Project;
}
