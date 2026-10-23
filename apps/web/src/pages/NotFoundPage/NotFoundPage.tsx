import { useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '@/components/Button';
import { StatePage } from '@/components/StatePage';
import { TextField } from '@/components/TextField';

const SearchForm = styled.form`
  width: 100%;
  display: flex;
  flex-direction: column;
  text-align: left;
`;

export interface NotFoundPageProps {
  /** `app` sits inside the app shell (signed in); `public` has no shell. */
  readonly variant: 'app' | 'public';
}

/**
 * `*` (unknown URL). Big quiet 404, one line, and a way out: signed-in users
 * can search their documents or go to the list; signed-out visitors go to the
 * marketing site. No automatic redirect. Signer links keep their own
 * invalid/expired pages and never land here.
 */
export function NotFoundPage({ variant }: NotFoundPageProps): JSX.Element {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const onSearch = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/documents?q=${encodeURIComponent(q)}` : '/documents');
  };

  return (
    <StatePage code="404" title="Page not found">
      {variant === 'app' ? (
        <>
          <SearchForm role="search" onSubmit={onSearch}>
            <TextField
              type="search"
              label="Find a document"
              iconLeft={Search}
              value={query}
              onChange={(value) => {
                setQuery(value);
              }}
            />
          </SearchForm>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              navigate('/documents');
            }}
          >
            Go to documents
          </Button>
        </>
      ) : (
        <Button variant="primary" size="md" onClick={() => window.location.assign('/')}>
          Go to seald.co
        </Button>
      )}
    </StatePage>
  );
}
