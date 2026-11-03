/**
 * One page of a cursor-paged list (`runs.list`, `builds.list`, `partitions.files`). Iterating it with
 * `for await` walks every item of every following page, fetching each page as it is reached.
 */
export class Page<T> implements AsyncIterable<T> {
  /** The items on this page. */
  readonly items: T[];
  /** Pass back as `cursor` for the next page; `null` on the last page. */
  readonly nextCursor: string | null;
  private readonly fetchPage: (cursor: string) => Promise<Page<T>>;

  constructor(items: T[], nextCursor: string | null, fetchPage: (cursor: string) => Promise<Page<T>>) {
    this.items = items;
    this.nextCursor = nextCursor;
    this.fetchPage = fetchPage;
  }

  /** Whether another page follows. */
  hasNextPage(): boolean {
    return this.nextCursor !== null;
  }

  /** Fetches the next page; `null` on the last page. */
  async nextPage(): Promise<Page<T> | null> {
    return this.nextCursor === null ? null : this.fetchPage(this.nextCursor);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let page: Page<T> | null = this;
    while (page) {
      for (const item of page.items) {
        yield item;
      }
      page = await page.nextPage();
    }
  }
}

/**
 * The result of a paged list call: await it for the first {@link Page}, or iterate it directly with `for await` to
 * walk every item: `for await (const run of mt.runs.list({ limit: 100 })) { … }`.
 */
export class PagePromise<T> implements PromiseLike<Page<T>>, AsyncIterable<T> {
  private readonly promise: Promise<Page<T>>;

  constructor(first: () => Promise<Page<T>>) {
    // Lazily started so an unused PagePromise makes no request; then shared by every consumer.
    let started: Promise<Page<T>> | undefined;
    this.promise = {
      then: (onFulfilled, onRejected) => (started ??= first()).then(onFulfilled, onRejected),
    } as Promise<Page<T>>;
  }

  then<R1 = Page<T>, R2 = never>(
    onFulfilled?: ((value: Page<T>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return Promise.resolve(this.promise).then(onFulfilled, onRejected);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    yield* await this.promise;
  }
}

/** Wraps the fetch of one page into a {@link PagePromise}. */
export function pages<T>(
  fetch: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>,
): PagePromise<T> {
  const load = async (cursor: string | undefined): Promise<Page<T>> => {
    const raw = await fetch(cursor);
    return new Page(raw.items ?? [], raw.nextCursor ?? null, (next) => load(next));
  };
  return new PagePromise(() => load(undefined));
}
