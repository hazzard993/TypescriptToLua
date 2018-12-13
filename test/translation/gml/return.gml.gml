function returnArray()
    var _;
    _[0] = 1;
    _[1] = 2;
    _[2] = 3;
    return _;
end
function returnNothing()
    return;
end
function returnExpression()
    return 3+5;
end
function returnObjectLiteral()
    var x = 5;
    var _ = ds_map_create();
    _[?1+2] = 5;
    _[?"x"] = x;
    _[?"y"] = 5;
    _[?"z"] = 6;
    return _;
end