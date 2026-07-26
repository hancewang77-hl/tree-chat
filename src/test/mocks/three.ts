import { vi } from "vitest";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => children,
  useFrame: vi.fn(),
  useThree: () => ({
    camera: {},
    gl: { domElement: document.createElement("canvas") },
    size: { width: 1024, height: 768 },
  }),
}));

vi.mock("@react-three/drei", () => ({
  Line: (props: Record<string, unknown>) => ({ type: "Line", props }),
  OrbitControls: () => null,
  OrthographicCamera: () => null,
  PerspectiveCamera: () => null,
  Text: ({ children }: { children?: React.ReactNode }) => children,
}));
