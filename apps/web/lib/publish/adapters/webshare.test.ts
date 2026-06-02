import { describe, it, expect } from "vitest";
import { websharePublisher } from "./webshare";

describe("websharePublisher", () => {
  describe("capability()", () => {
    it("returns WEBSHARE method with apiAvailable:false", () => {
      const cap = websharePublisher.capability();
      expect(cap.platform).toBe("WEBSHARE");
      expect(cap.method).toBe("WEBSHARE");
      expect(cap.apiAvailable).toBe(false);
    });
  });

  describe("publish()", () => {
    it("returns ok:true with WEBSHARE method and shareUrl = asset.url", async () => {
      const result = await websharePublisher.publish({
        kind: "IMAGE",
        url: "https://example.com/card.png",
        caption: "My challenge",
      });
      expect(result.ok).toBe(true);
      expect(result.method).toBe("WEBSHARE");
      expect(result.shareUrl).toBe("https://example.com/card.png");
    });

    it("works for VIDEO assets too", async () => {
      const result = await websharePublisher.publish({
        kind: "VIDEO",
        url: "https://example.com/recap.mp4",
      });
      expect(result.ok).toBe(true);
      expect(result.method).toBe("WEBSHARE");
      expect(result.shareUrl).toBe("https://example.com/recap.mp4");
    });
  });
});
