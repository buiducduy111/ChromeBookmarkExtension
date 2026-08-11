<?php

namespace App\Http\Controllers;

use App\Http\Resources\CategoryResource;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CategoryController extends Controller
{
    /**
     * List the current user's categories with bookmark counts, ordered by `order`.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $categories = $request->user()
            ->categories()
            ->withCount('bookmarks')
            ->orderBy('order')
            ->get();

        return CategoryResource::collection($categories);
    }

    /**
     * Create a new category for the current user.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'icon' => ['nullable', 'string', 'max:255'],
        ]);

        $maxOrder = (int) $request->user()->categories()->max('order');

        $category = $request->user()->categories()->create([
            'name' => $data['name'],
            'icon' => $data['icon'] ?? 'fa-solid fa-folder',
            'order' => $maxOrder + 1,
            'is_default' => false,
        ]);

        return (new CategoryResource($category))->response()->setStatusCode(201);
    }

    /**
     * Update one of the current user's categories.
     */
    public function update(Request $request, Category $category): CategoryResource
    {
        $this->authorizeOwnership($request, $category);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'icon' => ['sometimes', 'required', 'string', 'max:255'],
        ]);

        $category->update($data);

        return new CategoryResource($category);
    }

    /**
     * Delete a category. The default category cannot be deleted; any bookmarks
     * belonging to the removed category are moved to the default category first.
     */
    public function destroy(Request $request, Category $category): JsonResponse
    {
        $this->authorizeOwnership($request, $category);

        if ($category->is_default) {
            return response()->json([
                'message' => 'Không thể xóa danh mục mặc định.',
            ], 422);
        }

        $default = $request->user()->categories()->where('is_default', true)->first();

        if ($default) {
            $category->bookmarks()->update(['category_id' => $default->id]);
        }

        $category->delete();

        return response()->json(['deleted' => true]);
    }

    /**
     * Persist a new ordering for the current user's categories.
     */
    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'orderedIds' => ['required', 'array'],
            'orderedIds.*' => ['integer'],
        ]);

        foreach ($data['orderedIds'] as $index => $id) {
            $request->user()->categories()->where('id', $id)->update(['order' => $index]);
        }

        return response()->json(['reordered' => true]);
    }

    /**
     * Ensure the category belongs to the requesting user (guards against IDOR).
     */
    private function authorizeOwnership(Request $request, Category $category): void
    {
        abort_if($category->user_id !== $request->user()->id, 404);
    }
}
