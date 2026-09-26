fn main(value: Field, min_bound: pub Field, max_bound: pub Field) {
    let v: u64 = value as u64;
    let lo: u64 = min_bound as u64;
    let hi: u64 = max_bound as u64;
    assert(v >= lo);
    assert(v <= hi);
}
