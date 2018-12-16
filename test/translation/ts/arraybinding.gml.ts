let [a, b] = [1, 2];
let [c, , d] = [1, 2, 3];
let e, f = [1, 2];
let g = [1, 2, 3];
let [h, i] = g;
let [j, , k] = g;
// @ts-ignore
let [m, n] = l();