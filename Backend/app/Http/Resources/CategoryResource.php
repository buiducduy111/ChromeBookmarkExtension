<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CategoryResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * Field names are camelCased to match the extension client
     * (cat.id / name / icon / order / isDefault / count).
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'icon' => $this->icon,
            'order' => $this->order,
            'isDefault' => (bool) $this->is_default,
            // bookmarks_count is present when the query used withCount('bookmarks');
            // 0 otherwise (single-item responses; client re-fetches the list anyway).
            'count' => (int) ($this->bookmarks_count ?? 0),
        ];
    }
}
