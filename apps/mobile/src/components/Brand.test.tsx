import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Brand } from "./Brand";

describe("Brand", () => {
  it('renders "project50 v0.0.0" — proves jest-expo + RNTL + @project50/core reuse', () => {
    render(<Brand />);
    expect(screen.getByText("project50 v0.0.0")).toBeTruthy();
  });
});
