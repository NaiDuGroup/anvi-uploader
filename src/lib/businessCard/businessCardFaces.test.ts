import { describe, expect, it } from "vitest";
import {
  BUSINESS_CARD_BACK_PAPER_TYPE,
  BUSINESS_CARD_FRONT_PAPER_TYPE,
  businessCardFaces,
} from "./businessCardConstants";

const front = {
  id: "bbbb",
  paperType: BUSINESS_CARD_FRONT_PAPER_TYPE,
} as const;
const back = {
  id: "aaaa",
  paperType: BUSINESS_CARD_BACK_PAPER_TYPE,
} as const;

describe("businessCardFaces", () => {
  it("picks the faces by their side tags, whatever order they arrive in", () => {
    expect(businessCardFaces([front, back])).toEqual({ front, back });
    expect(businessCardFaces([back, front])).toEqual({ front, back });
  });

  it("reports no reverse for a single-sided run", () => {
    expect(businessCardFaces([front])).toEqual({ front, back: null });
  });

  it("falls back to insertion order for rows saved before the side tags", () => {
    const first = { id: "aaaa", paperType: null };
    const second = { id: "bbbb", paperType: null };
    expect(businessCardFaces([second, first])).toEqual({
      front: first,
      back: second,
    });
  });

  it("never returns the same file as both faces", () => {
    const only = { id: "aaaa", paperType: null };
    expect(businessCardFaces([only])).toEqual({ front: only, back: null });
  });

  it("trusts a lone back tag and takes the untagged file as the front", () => {
    const untagged = { id: "cccc", paperType: null };
    expect(businessCardFaces([untagged, back])).toEqual({
      front: untagged,
      back,
    });
  });

  it("has no faces when the line has no files", () => {
    expect(businessCardFaces([])).toEqual({ front: null, back: null });
  });
});
