import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// Testing Library's default 1s findBy*/waitFor budget is tight when the whole
// suite shares a busy machine (a first run right after the 70s server suite
// failed 4 lookups that all passed on the next 6 runs). A longer budget only
// delays a genuinely missing element; it does not change what is asserted.
configure({ asyncUtilTimeout: 4000 });
