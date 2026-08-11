<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BookmarkResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * Field names match the extension client (bm.id / title / url / favicon /
     * categoryId / createdAt). createdAt is epoch milliseconds so the client's
     * numeric sort (b.createdAt - a.createdAt) keeps working unchanged.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'url' => $this->url,
            'favicon' => $this->favicon,
            'categoryId' => $this->category_id,
            'createdAt' => $this->created_at ? $this->created_at->valueOf() : null,
        ];
    }
}
