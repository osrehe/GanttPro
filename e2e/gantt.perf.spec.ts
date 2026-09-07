import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@ganttpro.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "GanttPro2026!";
const PERF_PROJECT = "Proyecto de rendimiento (1.000 tareas)";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 });
}

/**
 * Rendimiento del Gantt con el seed de 1.110 tareas (UC-24). Requiere `npm run db:seed:perf`;
 * si el proyecto no existe, el test se omite. Reporta los números como anotaciones del test.
 */
test.describe("Rendimiento del Gantt (UC-24)", () => {
  test("render inicial < 1,5 s y arrastre < 16 ms por evento con 1.000 tareas", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await login(page);
    await expect(
      page.getByTestId("project-list").or(page.getByText("Aún no tienes proyectos")),
    ).toBeVisible();
    const card = page.getByTestId("project-card").filter({ hasText: PERF_PROJECT });
    if ((await card.count()) === 0)
      test.skip(true, "Falta el proyecto de rendimiento: ejecuta npm run db:seed:perf");

    // Calienta la compilación de la ruta en modo desarrollo antes de medir.
    const href = await card.getByRole("link", { name: PERF_PROJECT }).getAttribute("href");
    const ganttUrl = (href as string).replace(/\/table$/, "/gantt");
    await page.goto(ganttUrl);
    await expect(page.locator('[data-testid="gantt-bars"] g[data-task-id]').first()).toBeVisible({
      timeout: 90_000,
    });

    // Medición: carga completa de la página del Gantt.
    await page.goto(ganttUrl);
    await expect(page.locator('[data-testid="gantt-bars"] g[data-task-id]').first()).toBeVisible({
      timeout: 60_000,
    });
    const timings = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as
        PerformanceNavigationTiming | undefined;
      const hydrated = performance.getEntriesByName("project:hydrated")[0];
      const rendered = performance.getEntriesByName("gantt:rendered")[0];
      return {
        responseEnd: nav?.responseEnd ?? null,
        hydratedAt: hydrated?.startTime ?? null,
        renderedAt: rendered?.startTime ?? null,
      };
    });
    expect(timings.renderedAt).not.toBeNull();
    expect(timings.hydratedAt).not.toBeNull();
    const ganttRenderMs = (timings.renderedAt as number) - (timings.hydratedAt as number);
    const totalMs = timings.renderedAt as number;
    testInfo.annotations.push(
      {
        type: "render-gantt-ms",
        description: `${ganttRenderMs.toFixed(0)} ms desde datos cargados hasta barras pintadas`,
      },
      {
        type: "render-total-ms",
        description: `${totalMs.toFixed(0)} ms desde el inicio de la navegación (incluye red y compilación en dev)`,
      },
    );
    console.info(
      `[perf] Gantt 1.110 tareas: render ${ganttRenderMs.toFixed(0)} ms (total página ${totalMs.toFixed(0)} ms)`,
    );
    expect(ganttRenderMs).toBeLessThan(1500);

    // Arrastre de 2 segundos midiendo el costo de cada evento y los intervalos de frame.
    const bar = page
      .locator('[data-testid="gantt-bars"] g[data-task-id] rect[data-handle="move"]')
      .first();
    const box = await bar.boundingBox();
    if (!box) throw new Error("Barra sin caja");
    await page.evaluate(() => {
      window.__ganttDragStats = [];
      const w = window as unknown as { __frames: number[]; __stop: boolean };
      w.__frames = [];
      w.__stop = false;
      let last = performance.now();
      const loop = (): void => {
        const now = performance.now();
        w.__frames.push(now - last);
        last = now;
        if (!w.__stop) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const x0 = box.x + box.width / 2;
    const y0 = box.y + box.height / 2;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    const steps = 80;
    const started = Date.now();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x0 + i * 2, y0);
      await page.waitForTimeout(25);
    }
    const dragMs = Date.now() - started;
    // Volver al punto de partida para no modificar el proyecto de rendimiento.
    await page.mouse.move(x0, y0, { steps: 5 });
    await page.mouse.up();
    const stats = await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __stop: boolean };
      w.__stop = true;
      const handler = window.__ganttDragStats ?? [];
      const frames = w.__frames.slice(1);
      const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
      return {
        events: handler.length,
        avgHandlerMs: avg(handler),
        maxHandlerMs: handler.length ? Math.max(...handler) : 0,
        avgFrameMs: avg(frames),
        longFrames: frames.filter((f) => f > 32).length,
        frames: frames.length,
      };
    });
    testInfo.annotations.push(
      {
        type: "drag-handler-ms",
        description: `promedio ${stats.avgHandlerMs.toFixed(2)} ms, máximo ${stats.maxHandlerMs.toFixed(1)} ms en ${stats.events} eventos`,
      },
      {
        type: "drag-frame-ms",
        description: `intervalo medio ${stats.avgFrameMs.toFixed(1)} ms, ${stats.longFrames} frames > 32 ms de ${stats.frames} (${dragMs} ms de arrastre)`,
      },
    );
    console.info(
      `[perf] arrastre: ${stats.events} eventos, ${stats.avgHandlerMs.toFixed(2)} ms/evento (máx ${stats.maxHandlerMs.toFixed(1)}), ` +
        `frame medio ${stats.avgFrameMs.toFixed(1)} ms, ${stats.longFrames} frames largos de ${stats.frames}`,
    );
    expect(stats.events).toBeGreaterThan(20);
    expect(stats.avgHandlerMs).toBeLessThan(16);
    // La previsualización se pinta por DOM sin re-render: menos del 10 % de frames largos (> 32 ms).
    expect(stats.longFrames / Math.max(1, stats.frames)).toBeLessThan(0.1);
  });
});
