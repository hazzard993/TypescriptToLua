function returnArray() {
    return [1, 2, 3];
}

function returnNothing() {
    return;
}

function returnExpression() {
    return 3 + 5;
}

function returnObjectLiteral() {
    let x = 5;
    return {
        [1 + 2]: 5,
        x,
        "y": 5,
        z: 6,
    }
}