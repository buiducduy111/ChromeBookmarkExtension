<?php

namespace App\Http\Controllers;

use App\Http\Resources\BookmarkResource;
use App\Models\Bookmark;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class BookmarkController extends Controller
{
    /**
     * List the current user's bookmarks. Supports ?category_id= and ?q= filters.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = $request->user()->bookmarks()->latest();

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->integer('category_id'));
        }

        if ($request->filled('q')) {
            $q = $request->string('q');
            $query->where(function ($sub) use ($q) {
                $sub->where('title', 'like', "%{$q}%")
                    ->orWhere('url', 'like', "%{$q}%");
            });
        }

        return BookmarkResource::collection($query->get());
    }

    /**
     * Create a bookmark. Mirrors the client's addBookmark contract: a duplicate
     * URL in the same category returns { duplicate: true, bookmark } with 200.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'url' => ['required', 'string', 'max:2048'],
            'category_id' => ['required', 'integer'],
        ]);

        $categoryId = (int) $data['category_id'];
        $this->assertOwnsCategory($request, $categoryId);

        $existing = $request->user()->bookmarks()
            ->where('category_id', $categoryId)
            ->where('url', $data['url'])
            ->first();

        if ($existing) {
            return response()->json([
                'duplicate' => true,
                'bookmark' => new BookmarkResource($existing),
            ]);
        }

        $bookmark = $request->user()->bookmarks()->create([
            'category_id' => $categoryId,
            'title' => $data['title'] ?: $data['url'],
            'url' => $data['url'],
            'favicon' => $this->faviconFor($data['url']),
        ]);

        return response()->json([
            'duplicate' => false,
            'bookmark' => new BookmarkResource($bookmark),
        ], 201);
    }

    /**
     * Update one of the current user's bookmarks.
     */
    public function update(Request $request, Bookmark $bookmark): BookmarkResource
    {
        abort_if($bookmark->user_id !== $request->user()->id, 404);

        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'url' => ['sometimes', 'required', 'string', 'max:2048'],
            'category_id' => ['sometimes', 'required', 'integer'],
        ]);

        if (array_key_exists('category_id', $data)) {
            $data['category_id'] = (int) $data['category_id'];
            $this->assertOwnsCategory($request, $data['category_id']);
        }

        // Recompute the favicon when the URL changes.
        if (array_key_exists('url', $data) && $data['url'] !== $bookmark->url) {
            $data['favicon'] = $this->faviconFor($data['url']);
        }

        $bookmark->update($data);

        return new BookmarkResource($bookmark);
    }

    /**
     * Delete one of the current user's bookmarks.
     */
    public function destroy(Request $request, Bookmark $bookmark): JsonResponse
    {
        abort_if($bookmark->user_id !== $request->user()->id, 404);

        $bookmark->delete();

        return response()->json(['deleted' => true]);
    }

    /**
     * Bulk-insert bookmarks (used by the Chrome-import flow). Duplicates within a
     * category are skipped. Returns the number of new bookmarks created.
     */
    public function bulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bookmarks' => ['required', 'array'],
            'bookmarks.*.title' => ['nullable', 'string', 'max:255'],
            'bookmarks.*.url' => ['required', 'string', 'max:2048'],
            'bookmarks.*.category_id' => ['required', 'integer'],
        ]);

        $user = $request->user();
        $ownedCategoryIds = $user->categories()->pluck('id')->all();

        // Preload existing (category_id|url) keys to dedup in memory.
        $existing = $user->bookmarks()
            ->get(['category_id', 'url'])
            ->map(fn ($b) => $b->category_id . '|' . $b->url)
            ->flip();

        $count = 0;
        foreach ($data['bookmarks'] as $item) {
            $categoryId = (int) $item['category_id'];
            if (! in_array($categoryId, $ownedCategoryIds, true)) {
                continue;
            }
            $key = $categoryId . '|' . $item['url'];
            if ($existing->has($key)) {
                continue;
            }

            $user->bookmarks()->create([
                'category_id' => $categoryId,
                'title' => ($item['title'] ?? '') ?: $item['url'],
                'url' => $item['url'],
                'favicon' => $this->faviconFor($item['url']),
            ]);
            $existing->put($key, true);
            $count++;
        }

        return response()->json(['count' => $count]);
    }

    /**
     * Ensure the given category belongs to the requesting user.
     */
    private function assertOwnsCategory(Request $request, int $categoryId): void
    {
        $owns = Category::where('id', $categoryId)
            ->where('user_id', $request->user()->id)
            ->exists();

        abort_if(! $owns, 422, 'Danh mục không hợp lệ.');
    }

    /**
     * Build a Google favicon URL for the given bookmark URL.
     */
    private function faviconFor(string $url): ?string
    {
        $host = parse_url($url, PHP_URL_HOST);

        return $host ? "https://www.google.com/s2/favicons?domain={$host}&sz=32" : null;
    }
}
