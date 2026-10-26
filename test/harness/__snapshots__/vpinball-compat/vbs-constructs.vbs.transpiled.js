cGameName = 'twd_160h';
const MaxBalls = 5;
let score, bonus, playerName;
let balls = __vbs.dim([4]);
score = 0;
playerName = __stdlib.CStr('Player') + __stdlib.CStr('1');
function AddScore(points) {
    if (points > 0) {
        score = __vbs.add(score, points);
    } else if (__vbs.equals(points, 0)) {
        score = score;
    } else {
        score = __vbs.sub(score, 1);
    }
}
function DoubleIt(n) {
    let DoubleIt = undefined;
    DoubleIt = __vbs.mul(n, 2);
    return DoubleIt;
}
function TestLoop() {
    let i, total;
    total = 0;
    __exitFor:
        for (i = 1; 2 < 0 ? i >= 10 : i <= 10; i += 2) {
            total = __vbs.add(total, i);
        }
    let k;
    k = 0;
    __exitDo:
        while (k < 3) {
            k = __vbs.add(k, 1);
        }
    {
        let __vbsSelect = total;
        if (__vbs.equals(__vbsSelect, 1)) {
            total = 10;
        } else if (__vbs.equals(__vbsSelect, 2) || __vbs.equals(__vbsSelect, 3)) {
            total = 20;
        } else {
            total = 30;
        }
    }
}
function TestLogic(a, b) {
    let f;
    f = __vbs.or(__vbs.and(a, 7), __vbs.xor(b, 3));
    if (__vbs.not(__vbs.is(a, Nothing))) {
        f = __vbs.add(f, 1);
    }
    if (__vbs.or(__vbs.and(__vbs.equals(a, 1), __vbs.equals(b, 2)), f > 0)) {
        f = __vbs.mul(f, 2);
    }
}
function TestWith(obj) {
    obj.X = 1;
    obj.Y = 2;
}