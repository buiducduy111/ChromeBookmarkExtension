<?php

namespace Tests\Feature;

use App\Models\Bookmark;
use App\Models\Category;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BookmarkApiTest extends TestCase
{
    use RefreshDatabase;

    /** Register creates a user, a token, and a default "All" category. */
    public function test_register_creates_user_with_default_category(): void
    {
        $res = $this->postJson('/api/register', [
            'email' => 'alice@example.com',
            'password' => 'secret123',
            'name' => 'Alice',
        ]);

        $res->assertCreated()
            ->assertJsonStructure(['token', 'user' => ['id', 'name', 'email']]);

        $this->assertDatabaseHas('users', ['email' => 'alice@example.com']);
        $this->assertDatabaseHas('categories', [
            'name' => 'All',
            'is_default' => true,
            'icon' => 'fa-solid fa-bookmark',
        ]);
    }

    public function test_register_rejects_duplicate_email(): void
    {
        User::factory()->create(['email' => 'dup@example.com']);

        $this->postJson('/api/register', [
            'email' => 'dup@example.com',
            'password' => 'secret123',
        ])->assertStatus(422);
    }

    public function test_login_returns_token_and_rejects_bad_credentials(): void
    {
        $user = User::factory()->create([
            'email' => 'bob@example.com',
            'password' => 'secret123',
        ]);

        $this->postJson('/api/login', [
            'email' => 'bob@example.com',
            'password' => 'secret123',
        ])->assertOk()->assertJsonStructure(['token', 'user']);

        $this->postJson('/api/login', [
            'email' => 'bob@example.com',
            'password' => 'wrong',
        ])->assertStatus(422);
    }

    public function test_protected_routes_require_authentication(): void
    {
        $this->getJson('/api/categories')->assertUnauthorized();
        $this->getJson('/api/bookmarks')->assertUnauthorized();
    }

    public function test_category_crud_and_reorder(): void
    {
        $user = $this->userWithDefaultCategory();
        Sanctum::actingAs($user);

        // list -> only the default "All"
        $this->getJson('/api/categories')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.isDefault', true)
            ->assertJsonPath('data.0.count', 0);

        // create
        $work = $this->postJson('/api/categories', ['name' => 'Work', 'icon' => 'fa-solid fa-briefcase'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Work')
            ->assertJsonPath('data.isDefault', false)
            ->json('data');

        // update
        $this->putJson("/api/categories/{$work['id']}", ['name' => 'Job'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Job');

        // reorder
        $all = $user->categories()->where('is_default', true)->first();
        $this->postJson('/api/categories/reorder', ['orderedIds' => [$work['id'], $all->id]])
            ->assertOk();
        $this->assertSame(0, $user->categories()->find($work['id'])->order);
        $this->assertSame(1, $user->categories()->find($all->id)->order);

        // delete default is blocked
        $this->deleteJson("/api/categories/{$all->id}")->assertStatus(422);
    }

    public function test_deleting_category_moves_bookmarks_to_default(): void
    {
        $user = $this->userWithDefaultCategory();
        Sanctum::actingAs($user);
        $default = $user->categories()->where('is_default', true)->first();

        $work = $user->categories()->create(['name' => 'Work', 'icon' => 'x', 'order' => 1]);
        $bm = $user->bookmarks()->create([
            'category_id' => $work->id,
            'title' => 'Example',
            'url' => 'https://example.com',
        ]);

        $this->deleteJson("/api/categories/{$work->id}")->assertOk();

        $this->assertDatabaseMissing('categories', ['id' => $work->id]);
        $this->assertSame($default->id, $bm->fresh()->category_id);
    }

    public function test_bookmark_create_dedup_update_delete(): void
    {
        $user = $this->userWithDefaultCategory();
        Sanctum::actingAs($user);
        $cat = $user->categories()->where('is_default', true)->first();

        // create -> favicon derived, duplicate flag false, createdAt is epoch ms
        $create = $this->postJson('/api/bookmarks', [
            'title' => 'Example',
            'url' => 'https://example.com/page',
            'category_id' => $cat->id,
        ])->assertCreated()
            ->assertJsonPath('duplicate', false)
            ->assertJsonPath('bookmark.categoryId', $cat->id);

        $bm = $create->json('bookmark');
        $this->assertStringContainsString('google.com/s2/favicons', $bm['favicon']);
        $this->assertIsInt($bm['createdAt']);

        // duplicate URL in same category -> duplicate:true, 200
        $this->postJson('/api/bookmarks', [
            'title' => 'Example again',
            'url' => 'https://example.com/page',
            'category_id' => $cat->id,
        ])->assertOk()->assertJsonPath('duplicate', true);

        // update url -> favicon recomputed (single-resource PUT wraps in `data`)
        $this->putJson("/api/bookmarks/{$bm['id']}", ['url' => 'https://changed.dev/x'])
            ->assertOk()
            ->assertJsonPath('data.url', 'https://changed.dev/x');
        $this->assertStringContainsString('changed.dev', Bookmark::find($bm['id'])->favicon);

        // delete
        $this->deleteJson("/api/bookmarks/{$bm['id']}")->assertOk()->assertJsonPath('deleted', true);
        $this->assertDatabaseMissing('bookmarks', ['id' => $bm['id']]);
    }

    public function test_bookmark_filter_and_search(): void
    {
        $user = $this->userWithDefaultCategory();
        Sanctum::actingAs($user);
        $a = $user->categories()->where('is_default', true)->first();
        $b = $user->categories()->create(['name' => 'B', 'icon' => 'x', 'order' => 1]);

        $user->bookmarks()->create(['category_id' => $a->id, 'title' => 'Alpha', 'url' => 'https://alpha.com']);
        $user->bookmarks()->create(['category_id' => $b->id, 'title' => 'Beta', 'url' => 'https://beta.com']);

        $this->getJson("/api/bookmarks?category_id={$b->id}")->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/bookmarks?q=alpha')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Alpha');
    }

    public function test_bulk_import_skips_duplicates(): void
    {
        $user = $this->userWithDefaultCategory();
        Sanctum::actingAs($user);
        $cat = $user->categories()->where('is_default', true)->first();
        $user->bookmarks()->create(['category_id' => $cat->id, 'title' => 'Dup', 'url' => 'https://dup.com']);

        $this->postJson('/api/bookmarks/bulk', ['bookmarks' => [
            ['title' => 'Dup', 'url' => 'https://dup.com', 'category_id' => $cat->id],   // skipped
            ['title' => 'New1', 'url' => 'https://new1.com', 'category_id' => $cat->id], // added
            ['title' => 'New2', 'url' => 'https://new2.com', 'category_id' => $cat->id], // added
        ]])->assertOk()->assertJsonPath('count', 2);

        $this->assertSame(3, $user->bookmarks()->count());
    }

    public function test_user_cannot_touch_another_users_resources(): void
    {
        $owner = $this->userWithDefaultCategory();
        $cat = $owner->categories()->first();
        $bm = $owner->bookmarks()->create(['category_id' => $cat->id, 'title' => 'X', 'url' => 'https://x.com']);

        $attacker = $this->userWithDefaultCategory();
        Sanctum::actingAs($attacker);

        $this->putJson("/api/categories/{$cat->id}", ['name' => 'Hacked'])->assertNotFound();
        $this->deleteJson("/api/bookmarks/{$bm->id}")->assertNotFound();
        $this->postJson('/api/bookmarks', [
            'url' => 'https://y.com',
            'category_id' => $cat->id, // not attacker's category
        ])->assertStatus(422);
    }

    /** DOM <select> values arrive as strings; the API must accept them. */
    public function test_accepts_string_category_id(): void
    {
        $user = $this->userWithDefaultCategory();
        Sanctum::actingAs($user);
        $cat = $user->categories()->where('is_default', true)->first();

        $this->postJson('/api/bookmarks', [
            'title' => 'S',
            'url' => 'https://str.com',
            'category_id' => (string) $cat->id,
        ])->assertCreated()->assertJsonPath('duplicate', false);

        $this->postJson('/api/bookmarks/bulk', ['bookmarks' => [
            ['title' => 'B', 'url' => 'https://str-bulk.com', 'category_id' => (string) $cat->id],
        ]])->assertOk()->assertJsonPath('count', 1);
    }

    private function userWithDefaultCategory(): User
    {
        $user = User::factory()->create();
        $user->categories()->create([
            'name' => 'All',
            'icon' => 'fa-solid fa-bookmark',
            'order' => 0,
            'is_default' => true,
        ]);

        return $user;
    }
}
