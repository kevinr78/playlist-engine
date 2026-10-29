function validateData(...args: Array<string | number | Array<string>>) {
  for (const arg of args) {
    if (arg === "" || arg === null || arg === undefined) {
      return false;
    }
  }

  return true;
}

const getNextNumberForId = function () {
  let count = 21;
  return function () {
    return count++;
  };
};
export { validateData, getNextNumberForId };
