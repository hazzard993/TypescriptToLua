// Just a return statement
// @ts-ignore
return;

// Return array
// @ts-ignore
return [1, 2, 3];

// Return expression result
// @ts-ignore
return 3 + 5;

// Return json/ds_map
// @ts-ignore
return {
    [1 + 2]: 5,
    x,
    "y": 5,
    z: 6,
};

// Indent tests
if (true) {
    // @ts-ignore
    return;
}

if (true) {
    // @ts-ignore
    return [1, 2, 3];
}

if (true) {
    // @ts-ignore
    return 3 + 5;
}

if (true) {
    // @ts-ignore
    return {
        [1 + 2]: 5,
        x,
        "y": 5,
        z: 6,
    };
}